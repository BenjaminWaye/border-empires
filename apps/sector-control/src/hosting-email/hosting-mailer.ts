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
import type { HostingEmailOutbox, NewOutboxEmail, OutboxEmail } from "./hosting-email-outbox.js";
import {
  idleWarningEmail, orderConfirmationEmail, sectorReadyEmail, shareChargedEmail, shareConfirmationEmail, shareReleasedEmail, withdrawalAckEmail, type RenderedEmail
} from "./hosting-email-content.js";
import { PermanentEmailError, type HostingEmailTransport } from "./resend-email-transport.js";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Members are emailed this long before an idle sector closes (Terms of Sale section 5). */
export const IDLE_WARNING_LEAD_MS = 2 * DAY;
/**
 * How long an idle sector waits for its warning to be delivered while the
 * email provider fails. After that it closes anyway and the owner is told: a
 * server must not run, and cost, for ever because email is down.
 */
export const IDLE_WARNING_MAX_WAIT_MS = 7 * DAY;
/** How far back the sweep looks for purchases to confirm. Longer than any plausible outage of the service. */
export const CONFIRMATION_SWEEP_WINDOW_MS = 7 * DAY;
/** Sent and abandoned emails are kept this long, then pruned. Longer than the sweep window, so nothing is confirmed twice. */
export const OUTBOX_RETENTION_MS = 90 * DAY;
/** An address of an account in no running or ended sector is deleted this long after it was last used. */
export const ADDRESS_RETENTION_MS = 30 * DAY;
/** Attempts before an email is given up and the owner told. With the backoff below, about a day. */
export const MAX_SEND_ATTEMPTS = 10;
const SEND_BATCH = 25;
/** A pass stops sending after this long, so a slow email provider cannot hold up creating, capturing and closing. */
const SEND_BUDGET_MS = 20_000;

/** 2, 4, 8 ... minutes, at most 6 hours. */
export const emailRetryDelayMs = (attempts: number): number => Math.min(6 * HOUR, 2 ** attempts * MINUTE);

/** The Terms of Sale page as published, attached to order confirmations. */
export type HostingTermsAttachment = { version: string; html: string };

/**
 * Where an idle sector's warning stands. `sentAt` is when the first member's
 * copy went out; `pending` counts copies still being tried.
 */
export type IdleWarningStatus = { writtenAt: number; sentAt?: number; pending: number };

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

/** "idle:<sector id>:<last visit>" -> the sector id. */
const idleSectorId = (email: OutboxEmail): string | undefined => email.groupKey?.split(":")[1];

export const createHostingMailer = (deps: HostingMailerDeps) => {
  const { store, outbox, appUrl } = deps;

  /** Writes an email unless one with its key exists. The text is rendered only for a new one. */
  const enqueueOnce = (email: Omit<NewOutboxEmail, keyof RenderedEmail>, render: () => RenderedEmail, now: number): void => {
    if (!outbox.get(email.emailKey)) outbox.enqueue({ ...email, ...render() }, now);
  };

  const confirmPurchases = (now: number): void => {
    const since = now - CONFIRMATION_SWEEP_WINDOW_MS;
    for (const sector of store.listSectorsPaidSince(since)) {
      // Paid in full by its host. A split-funded sector has no consent of its own: each share is confirmed below.
      const { consent, paidAt } = sector;
      if (!consent || paidAt === undefined) continue;
      enqueueOnce(
        { emailKey: `order:${sector.sectorId}`, kind: "order_confirmation", accountUid: sector.hostUid, attachTermsVersion: consent.termsVersion },
        () => orderConfirmationEmail(appUrl, { sectorId: sector.sectorId, options: sector.options, amountCents: sector.amountCents, currency: sector.currency, paidAt, consent }),
        now
      );
    }
    for (const share of store.listContributionsChangedSince(["held", "captured", "released"], since)) {
      const { consent } = share;
      if (!consent) continue;
      const sector = store.getSector(share.sectorId);
      const currency = sector?.currency ?? "usd";
      const base = { sectorId: share.sectorId, amountCents: share.amountCents, currency, consent };
      if (share.state === "held") {
        enqueueOnce(
          { emailKey: `share:${share.contributionId}`, kind: "share_confirmation", accountUid: share.accountUid, attachTermsVersion: consent.termsVersion },
          () => shareConfirmationEmail(appUrl, { ...base, pledgedAt: share.createdAt, ...(sector?.fundingDeadline !== undefined ? { fundingDeadline: sector.fundingDeadline } : {}) }),
          now
        );
      } else if (share.state === "captured") {
        // The contract's price is what was charged, which can be less than the hold (Terms of Sale section 6a).
        enqueueOnce(
          { emailKey: `share-charged:${share.contributionId}`, kind: "share_confirmation", accountUid: share.accountUid, attachTermsVersion: consent.termsVersion },
          () => shareChargedEmail(appUrl, { ...base, chargedAt: share.updatedAt }),
          now
        );
      } else if (outbox.get(`share:${share.contributionId}`)) {
        // Released: only someone told their card was held needs telling it was let go.
        enqueueOnce({ emailKey: `share-released:${share.contributionId}`, kind: "share_confirmation", accountUid: share.accountUid }, () => shareReleasedEmail(appUrl, base), now);
      }
    }
    for (const withdrawal of store.listWithdrawalsSince(since)) {
      const currency = store.getSector(withdrawal.sectorId)?.currency ?? "usd";
      enqueueOnce(
        { emailKey: `withdrawal:${withdrawal.withdrawalKey}`, kind: "withdrawal_ack", accountUid: withdrawal.accountUid },
        () => withdrawalAckEmail(appUrl, {
          sectorId: withdrawal.sectorId, share: withdrawal.contributionId !== undefined, currency,
          paidCents: withdrawal.paidCents, deductionCents: withdrawal.deductionCents, refundCents: withdrawal.refundCents, requestedAt: withdrawal.requestedAt
        }),
        now
      );
    }
  };

  const giveUp = (email: OutboxEmail, reason: string, now: number): void => {
    outbox.markAbandoned(email.emailKey, reason, now);
    deps.alert("email_failed", { emailKey: email.emailKey, kind: email.kind, reason });
  };

  /** Tries again later; after MAX_SEND_ATTEMPTS, gives up and tells the owner. `alertNow` tells the owner on the first failure too. */
  const retryLater = (email: OutboxEmail, reason: string, now: number, alertNow = false): void => {
    if (email.attempts + 1 >= MAX_SEND_ATTEMPTS) {
      giveUp(email, reason, now);
      return;
    }
    if (alertNow && email.attempts === 0) deps.alert("email_failed", { emailKey: email.emailKey, kind: email.kind, reason, retrying: 1 });
    outbox.markRetry(email.emailKey, reason, now + emailRetryDelayMs(email.attempts + 1));
  };

  const sendOne = async (transport: HostingEmailTransport, email: OutboxEmail, now: number): Promise<boolean> => {
    if (email.kind === "idle_warning") {
      // A warning about a sector that has closed, or to someone no longer in it, is no use any more.
      const sectorId = idleSectorId(email);
      const sector = sectorId ? store.getSector(sectorId) : undefined;
      if (sector?.state !== "open" || !store.getMember(sector.sectorId, email.accountUid)) {
        outbox.markAbandoned(email.emailKey, "the sector closed or the member left before it was sent", now);
        return false;
      }
    }
    // The first attempt's address is kept, so every retry is the same request to the provider.
    const to = email.toAddress ?? outbox.getAddress(email.accountUid);
    if (!to) {
      giveUp(email, "no email address for this account", now);
      return false;
    }
    if (email.attachTermsVersion !== undefined && deps.terms?.version !== email.attachTermsVersion) {
      // Never another version in place of the one agreed to. A later deploy may load the right one; otherwise it is sent by hand.
      retryLater(email, `terms version ${email.attachTermsVersion} is not loaded (have ${deps.terms?.version ?? "none"}); send the confirmation by hand if this persists`, now, true);
      return false;
    }
    if (email.toAddress === undefined) outbox.setToAddress(email.emailKey, to);
    try {
      await transport.send({
        to, subject: email.subject, text: email.text, html: email.html, idempotencyKey: email.emailKey,
        ...(email.attachTermsVersion !== undefined && deps.terms
          ? { attachments: [{ filename: `border-empires-terms-of-sale-${deps.terms.version}.html`, content: deps.terms.html, contentType: "text/html" }] }
          : {})
      });
      outbox.markSent(email.emailKey, deps.now());
      return true;
    } catch (error) {
      if (error instanceof PermanentEmailError) giveUp(email, errorText(error), deps.now());
      else retryLater(email, errorText(error), deps.now());
      return false;
    }
  };

  return {
    /** Keeps the verified address of an account that buys or joins, for the emails about that sector. */
    rememberAddress(account: { uid: string; email?: string; emailVerified: boolean }): void {
      const email = account.email?.trim();
      if (email && account.emailVerified) outbox.rememberAddress(account.uid, email, deps.now());
    },

    /** "Your sector is ready", to its host. */
    sectorReady(sector: SectorRecord): void {
      enqueueOnce({ emailKey: `ready:${sector.sectorId}`, kind: "sector_ready", accountUid: sector.hostUid }, () => sectorReadyEmail(appUrl, { sectorId: sector.sectorId, options: sector.options }), deps.now());
    },

    /**
     * Writes the warning to every member of an idle sector, once per idle
     * stretch (a visit starts a new one), and reports where it stands.
     * Undefined when the sector has no members: nobody to warn.
     */
    warnIdle(sector: SectorRecord, lastVisitAt: number, closesAt: number, now: number): IdleWarningStatus | undefined {
      const groupKey = `idle:${sector.sectorId}:${lastVisitAt}`;
      const members = store.listMemberUids(sector.sectorId);
      if (members.length === 0) return undefined;
      if (outbox.groupStatus(groupKey).writtenAt === undefined) {
        const rendered = idleWarningEmail(appUrl, { sectorId: sector.sectorId, lastVisitAt, closesAt, now });
        for (const accountUid of members) outbox.enqueue({ emailKey: `${groupKey}:${accountUid}`, groupKey, kind: "idle_warning", accountUid, ...rendered }, now);
      }
      const status = outbox.groupStatus(groupKey);
      return { writtenAt: status.writtenAt ?? now, pending: status.pending, ...(status.sentAt !== undefined ? { sentAt: status.sentAt } : {}) };
    },

    /** True once emails can actually go out. */
    canSend: (): boolean => deps.transport !== undefined,

    /** One reconciler pass: confirm new purchases, send what is due, prune what is old. */
    async runOnce(): Promise<{ sent: number; pending: number; addresses: number }> {
      const now = deps.now();
      confirmPurchases(now);
      let sent = 0;
      const { transport } = deps;
      if (transport) {
        const started = Date.now();
        for (const email of outbox.listDue(now, SEND_BATCH)) {
          if (Date.now() - started > SEND_BUDGET_MS) break;
          if (await sendOne(transport, email, deps.now())) sent += 1;
        }
      }
      outbox.pruneFinished(now - OUTBOX_RETENTION_MS);
      outbox.pruneAddresses(now - ADDRESS_RETENTION_MS);
      return { sent, pending: outbox.countPending(), addresses: outbox.countAddresses() };
    }
  };
};

export type HostingMailer = ReturnType<typeof createHostingMailer>;

/**
 * The Terms of Sale this build sells under, from the page's HTML. The page
 * names its version in `<meta name="terms-version">`; a page that names none,
 * or another version than this build's, is refused, so a buyer is never sent
 * other Terms than the ones they agreed to.
 */
export const termsAttachment = (html: string): HostingTermsAttachment => {
  const version = /<meta\s+name="terms-version"\s+content="([^"]+)"/.exec(html)?.[1];
  if (version !== HOSTED_SECTOR_TERMS_VERSION) {
    throw new Error(`the Terms of Sale page is version ${version ?? "(none)"}, but this build sells under ${HOSTED_SECTOR_TERMS_VERSION}`);
  }
  return { version, html };
};
