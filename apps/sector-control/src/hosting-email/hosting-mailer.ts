// When the hosting service emails players, and to whom (plan section 15, step
// 8c). Every email is written to the outbox first (hosting-email-outbox.ts)
// and sent by the reconciler, so a crash, a restart or an email provider
// outage delays an email but never loses or repeats it.
//
// Purchases are confirmed by a sweep over recent purchases rather than by
// hooks on each state change: a sector or a share can become paid along
// several paths (the webhook, the reconciler asking the provider, a missed
// hold found later), and the sweep covers all of them.
import { HOSTED_SECTOR_TERMS_VERSION } from "@border-empires/shared";

import type { HostingStore, SectorRecord } from "../hosting-store/hosting-store.js";
import type { HostingAlert } from "../providers/providers.js";
import type { HostingEmailOutbox, NewOutboxEmail } from "./hosting-email-outbox.js";
import { idleWarningEmail, orderConfirmationEmail, sectorReadyEmail, shareConfirmationEmail, withdrawalAckEmail, type RenderedEmail } from "./hosting-email-content.js";
import type { HostingEmailTransport } from "./resend-email-transport.js";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Members are emailed this long before an idle sector closes (Terms of Sale section 5). */
export const IDLE_WARNING_LEAD_MS = 2 * DAY;
/** How far back the sweep looks for purchases to confirm. Longer than any plausible outage of the service. */
export const CONFIRMATION_SWEEP_WINDOW_MS = 7 * DAY;
/** Sent and abandoned emails are kept this long, then pruned. Longer than the sweep window, so nothing is confirmed twice. */
export const OUTBOX_RETENTION_MS = 90 * DAY;
/** Attempts before an email is given up and the owner told. With the backoff below, about a day. */
export const MAX_SEND_ATTEMPTS = 10;
const SEND_BATCH = 25;

/** 2, 4, 8 ... minutes, at most 6 hours. */
export const emailRetryDelayMs = (attempts: number): number => Math.min(6 * HOUR, 2 ** attempts * MINUTE);

/** The Terms of Sale page as published, attached to order confirmations. */
export type HostingTermsAttachment = { version: string; html: string };

export type HostingMailerDeps = {
  store: HostingStore;
  outbox: HostingEmailOutbox;
  /** Undefined while no email key is configured: emails wait in the outbox. */
  transport?: HostingEmailTransport;
  terms?: HostingTermsAttachment;
  /** The web client, for the button in every email. */
  appUrl: string;
  alert: HostingAlert;
  now: () => number;
};

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error)).slice(0, 500);

export const createHostingMailer = (deps: HostingMailerDeps) => {
  const { store, outbox, appUrl } = deps;

  const enqueue = (email: Omit<NewOutboxEmail, keyof RenderedEmail>, rendered: RenderedEmail, now: number): boolean =>
    outbox.enqueue({ ...email, ...rendered }, now);

  const confirmPurchases = (now: number): void => {
    const since = now - CONFIRMATION_SWEEP_WINDOW_MS;
    for (const sector of store.listSectorsPaidSince(since)) {
      // Paid in full by its host. A split-funded sector has no consent of its own: each share is confirmed below.
      if (!sector.consent || sector.paidAt === undefined || outbox.get(`order:${sector.sectorId}`)) continue;
      enqueue(
        { emailKey: `order:${sector.sectorId}`, kind: "order_confirmation", accountUid: sector.hostUid, attachTermsVersion: sector.consent.termsVersion },
        orderConfirmationEmail(appUrl, { sectorId: sector.sectorId, options: sector.options, amountCents: sector.amountCents, currency: sector.currency, paidAt: sector.paidAt, consent: sector.consent }),
        now
      );
    }
    for (const share of store.listContributionsChangedSince(["held", "captured"], since)) {
      if (!share.consent || outbox.get(`share:${share.contributionId}`)) continue;
      const sector = store.getSector(share.sectorId);
      enqueue(
        { emailKey: `share:${share.contributionId}`, kind: "share_confirmation", accountUid: share.accountUid, attachTermsVersion: share.consent.termsVersion },
        shareConfirmationEmail(appUrl, {
          sectorId: share.sectorId, amountCents: share.amountCents, currency: sector?.currency ?? "usd", pledgedAt: share.createdAt,
          charged: share.state === "captured", consent: share.consent,
          ...(sector?.fundingDeadline !== undefined ? { fundingDeadline: sector.fundingDeadline } : {})
        }),
        now
      );
    }
    for (const withdrawal of store.listWithdrawalsSince(since)) {
      if (outbox.get(`withdrawal:${withdrawal.withdrawalKey}`)) continue;
      const sector = store.getSector(withdrawal.sectorId);
      enqueue(
        { emailKey: `withdrawal:${withdrawal.withdrawalKey}`, kind: "withdrawal_ack", accountUid: withdrawal.accountUid },
        withdrawalAckEmail(appUrl, {
          sectorId: withdrawal.sectorId, share: withdrawal.contributionId !== undefined, currency: sector?.currency ?? "usd",
          paidCents: withdrawal.paidCents, deductionCents: withdrawal.deductionCents, refundCents: withdrawal.refundCents, requestedAt: withdrawal.requestedAt
        }),
        now
      );
    }
  };

  const giveUp = (emailKey: string, kind: string, reason: string, now: number): void => {
    outbox.markAbandoned(emailKey, reason, now);
    deps.alert("email_failed", { emailKey, kind, reason });
  };

  return {
    /** Keeps the verified address of an account that buys or joins, for the emails about that sector. */
    rememberAddress(account: { uid: string; email?: string; emailVerified: boolean }): void {
      const email = account.email?.trim();
      if (email && account.emailVerified) outbox.rememberAddress(account.uid, email, deps.now());
    },

    /** "Your sector is ready", to its host. */
    sectorReady(sector: SectorRecord): void {
      enqueue({ emailKey: `ready:${sector.sectorId}`, kind: "sector_ready", accountUid: sector.hostUid }, sectorReadyEmail(appUrl, { sectorId: sector.sectorId, options: sector.options }), deps.now());
    },

    /**
     * Warns every member that an idle sector is about to close, once per idle
     * stretch (a visit starts a new one). Returns when the warning was first
     * written: the sector may close no sooner than IDLE_WARNING_LEAD_MS later.
     */
    warnIdle(sector: SectorRecord, lastVisitAt: number, closesAt: number, now: number): number {
      const groupKey = `idle:${sector.sectorId}:${lastVisitAt}`;
      const warnedAt = outbox.firstQueuedAt(groupKey);
      if (warnedAt !== undefined) return warnedAt;
      const rendered = idleWarningEmail(appUrl, { sectorId: sector.sectorId, lastVisitAt, closesAt, now });
      for (const accountUid of store.listMemberUids(sector.sectorId)) {
        enqueue({ emailKey: `${groupKey}:${accountUid}`, groupKey, kind: "idle_warning", accountUid }, rendered, now);
      }
      return outbox.firstQueuedAt(groupKey) ?? now;
    },

    /** One reconciler pass: confirm new purchases, send what is due, prune what is old. */
    async runOnce(): Promise<{ sent: number; pending: number }> {
      const now = deps.now();
      confirmPurchases(now);
      let sent = 0;
      if (deps.transport) {
        for (const email of outbox.listDue(now, SEND_BATCH)) {
          // A warning that could not go out before the sector's closing is no use any more.
          if (email.kind === "idle_warning" && now - email.createdAt >= IDLE_WARNING_LEAD_MS) {
            giveUp(email.emailKey, email.kind, "not sent before the sector closed", now);
            continue;
          }
          const to = outbox.getAddress(email.accountUid);
          if (!to) {
            giveUp(email.emailKey, email.kind, "no email address for this account", now);
            continue;
          }
          if (email.attachTermsVersion !== undefined && (!deps.terms || deps.terms.version !== email.attachTermsVersion)) {
            // The buyer must get the Terms they agreed to; a different version is never sent in their place.
            giveUp(email.emailKey, email.kind, `terms version ${email.attachTermsVersion} is not loaded; send the confirmation by hand`, now);
            continue;
          }
          try {
            await deps.transport.send({
              to, subject: email.subject, text: email.text, html: email.html, idempotencyKey: email.emailKey,
              ...(email.attachTermsVersion !== undefined && deps.terms
                ? { attachments: [{ filename: `border-empires-terms-of-sale-${deps.terms.version}.html`, content: deps.terms.html, contentType: "text/html" }] }
                : {})
            });
            outbox.markSent(email.emailKey, deps.now());
            sent += 1;
          } catch (error) {
            if (email.attempts + 1 >= MAX_SEND_ATTEMPTS) giveUp(email.emailKey, email.kind, errorText(error), deps.now());
            else outbox.markRetry(email.emailKey, errorText(error), deps.now() + emailRetryDelayMs(email.attempts + 1));
          }
        }
      }
      outbox.pruneFinished(now - OUTBOX_RETENTION_MS);
      return { sent, pending: outbox.countPending() };
    }
  };
};

export type HostingMailer = ReturnType<typeof createHostingMailer>;

/** The Terms of Sale this build sells under, from the published page's HTML. */
export const termsAttachment = (html: string): HostingTermsAttachment => ({ version: HOSTED_SECTOR_TERMS_VERSION, html });
