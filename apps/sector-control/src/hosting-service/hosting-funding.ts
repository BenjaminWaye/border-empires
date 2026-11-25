// Split funding (docs/hosted-sectors-plan.md, section 12): a host opens a
// funding bar, members chip in, and the sector starts once the bar is full.
//
// Each share only holds the money on the card. Nothing is charged until the
// bar is full; if the 72-hour deadline passes first, every hold is released
// and nobody pays (owner decision Q10). The reconciler does the capturing and
// releasing (funding-reconciler.ts); this module handles what players ask for
// and what the payment provider reports.
import { HOSTED_SECTOR_PRICE_USD_CENTS, type HostedSectorOptions } from "@border-empires/shared";

import type { ContributionRecord, HostingStore, SectorRecord } from "../hosting-store/hosting-store.js";
import type { HostingAlert, PaymentProvider } from "../providers/providers.js";
import type { HostingConfig } from "./hosting-config.js";

export type ContributionEvent = { eventId: string; kind: "held" | "expired" | "refunded" | "disputed"; contributionId: string };

export type FundingView = {
  targetCents: number;
  /** Held or captured: money that will start the sector. */
  pledgedCents: number;
  /** In checkout now, not yet held. */
  pendingCents: number;
  deadline: number;
  minimumCents: number;
  /** This account's own pledged share. */
  yourCents: number;
  /** This account's unfinished checkout, to resume it. */
  yourCheckoutUrl?: string;
};

type Fail = { ok: false; code: FundingErrorCode; message: string };
export type FundingErrorCode = "SALES_CLOSED" | "ACCOUNT_REQUIRED" | "EMAIL_NOT_VERIFIED" | "ALREADY_HOSTING" | "PAYMENT_UNAVAILABLE"
  | "NOT_FOUND" | "FUNDING_CLOSED" | "BAD_AMOUNT";

const fail = (code: FundingErrorCode, message: string): Fail => ({ ok: false, code, message });

const PLEDGED: readonly ContributionRecord["state"][] = ["held", "captured"];

/** Pledged and in-checkout totals. A checkout older than its lifetime no longer counts as pending. */
export const fundingTotals = (contributions: readonly ContributionRecord[], now: number, checkoutExpiryMs: number): { pledgedCents: number; pendingCents: number } => ({
  pledgedCents: contributions.filter((c) => PLEDGED.includes(c.state)).reduce((sum, c) => sum + c.amountCents, 0),
  pendingCents: contributions.filter((c) => c.state === "awaiting_payment" && now - c.createdAt < checkoutExpiryMs).reduce((sum, c) => sum + c.amountCents, 0)
});

export const createFundingService = (deps: {
  store: HostingStore;
  payment: PaymentProvider;
  alert: HostingAlert;
  config: HostingConfig;
  now: () => number;
  newId: (length: number) => string;
}) => {
  const { store, config } = deps;

  const view = (sector: SectorRecord, accountUid: string): FundingView | undefined => {
    if (sector.state !== "funding" || sector.fundingDeadline === undefined) return undefined;
    const contributions = store.listContributions(sector.sectorId);
    const totals = fundingTotals(contributions, deps.now(), config.checkoutExpiryMs);
    const mine = contributions.filter((c) => c.accountUid === accountUid);
    const unfinished = mine.find((c) => c.state === "awaiting_payment" && c.checkoutUrl && deps.now() - c.createdAt < config.checkoutExpiryMs);
    return {
      targetCents: sector.amountCents,
      ...totals,
      deadline: sector.fundingDeadline,
      minimumCents: config.minContributionCents,
      yourCents: mine.filter((c) => PLEDGED.includes(c.state)).reduce((sum, c) => sum + c.amountCents, 0),
      ...(unfinished?.checkoutUrl ? { yourCheckoutUrl: unfinished.checkoutUrl } : {})
    };
  };

  return {
    view,

    /** Opens a bar instead of paying in full. The opener is the host and a member at once, so the invite link can go out. */
    openFundingBar(account: { uid: string; isGuest: boolean; emailVerified: boolean }, options: HostedSectorOptions): { ok: true; sector: SectorRecord } | Fail {
      if (!config.salesEnabled) return fail("SALES_CLOSED", "Hosting is not on sale right now.");
      if (account.isGuest) return fail("ACCOUNT_REQUIRED", "Sign in with an account to host a sector.");
      if (!account.emailVerified) return fail("EMAIL_NOT_VERIFIED", "Verify your email address to host a sector.");
      // One open bar or live sector per account (plan section 12, rule 5).
      if (store.liveSectorForHost(account.uid)) return fail("ALREADY_HOSTING", "You already have a hosted sector running or being funded.");
      const now = deps.now();
      const sectorId = `s-${deps.newId(10)}`;
      store.insertSector({
        sectorId, hostUid: account.uid, options, state: "funding", fundingDeadline: now + config.fundingDeadlineMs,
        amountCents: HOSTED_SECTOR_PRICE_USD_CENTS, currency: "usd", createdAt: now, updatedAt: now, createAttempts: 0
      });
      store.addMember({ sectorId, accountUid: account.uid, role: "host", joinedAt: now });
      const sector = store.getSector(sectorId);
      if (!sector) throw new Error(`sector ${sectorId} vanished after insert`);
      return { ok: true, sector };
    },

    /**
     * A member pledges a share. At least the minimum (USD 5) unless less than
     * that is left, and never more than is left: the host pays "the rest" by
     * pledging exactly what is left. Checkouts in progress do not reduce what
     * is left, so nobody can lock the bar by starting a payment and leaving;
     * if several fill it at once, the reconciler takes only what is needed
     * and releases the rest. A new pledge replaces the member's own
     * unfinished one.
     */
    async contribute(account: { uid: string; isGuest: boolean; emailVerified: boolean }, sectorId: string, amountCents: number): Promise<{ ok: true; checkoutUrl: string } | Fail> {
      if (account.isGuest) return fail("ACCOUNT_REQUIRED", "Sign in with an account to chip in.");
      if (!account.emailVerified) return fail("EMAIL_NOT_VERIFIED", "Verify your email address to chip in.");
      const sector = store.getSector(sectorId);
      if (!sector || !store.getMember(sectorId, account.uid)) return fail("NOT_FOUND", "No such sector.");
      const now = deps.now();
      if (sector.state !== "funding" || sector.fundingDeadline === undefined || now >= sector.fundingDeadline) {
        return fail("FUNDING_CLOSED", "This funding bar is closed.");
      }
      const contributions = store.listContributions(sectorId);
      const { pledgedCents } = fundingTotals(contributions, now, config.checkoutExpiryMs);
      const left = sector.amountCents - pledgedCents;
      const minimum = Math.min(config.minContributionCents, left);
      if (!Number.isInteger(amountCents) || left <= 0 || amountCents < minimum || amountCents > left) {
        return fail("BAD_AMOUNT", left <= 0 ? "The bar is full or about to be." : `Choose between USD ${(minimum / 100).toFixed(2)} and USD ${(left / 100).toFixed(2)}.`);
      }
      for (const unfinished of contributions.filter((c) => c.accountUid === account.uid && c.state === "awaiting_payment")) {
        // Close the earlier page first, so the same person cannot end up paying twice.
        try {
          if (unfinished.paymentRef) await deps.payment.release(unfinished.paymentRef);
        } catch {
          return fail("PAYMENT_UNAVAILABLE", "Your earlier payment could not be closed. Nothing new was started; please try again.");
        }
        store.transitionContribution(unfinished.contributionId, ["awaiting_payment"], { state: "cancelled" }, now);
      }
      const contributionId = `c-${deps.newId(12)}`;
      store.insertContribution({ contributionId, sectorId, accountUid: account.uid, amountCents, state: "awaiting_payment", createdAt: now, updatedAt: now });
      try {
        const checkout = await deps.payment.createContributionCheckout({ contributionId, sectorId, accountUid: account.uid, amountCents, currency: sector.currency, options: sector.options, createdAt: now });
        store.transitionContribution(contributionId, ["awaiting_payment"], { paymentRef: checkout.paymentRef, checkoutUrl: checkout.checkoutUrl }, deps.now());
        return { ok: true, checkoutUrl: checkout.checkoutUrl };
      } catch {
        store.transitionContribution(contributionId, ["awaiting_payment"], { state: "cancelled" }, deps.now());
        return fail("PAYMENT_UNAVAILABLE", "Payment could not be started. Nothing was charged; please try again.");
      }
    },

    /** Applies a verified provider event about one share. Safe to repeat. */
    async handleContributionEvent(event: ContributionEvent): Promise<{ applied: boolean }> {
      const now = deps.now();
      const contribution = store.getContribution(event.contributionId);
      if (!contribution) {
        deps.alert("payment_for_unknown_sector", { contributionId: event.contributionId, kind: event.kind });
        return { applied: false };
      }
      if (event.kind === "held") {
        const sector = store.getSector(contribution.sectorId);
        // Only a hold placed before the deadline counts (Q10).
        if (sector?.state === "funding" && sector.fundingDeadline !== undefined && now < sector.fundingDeadline) {
          return { applied: store.transitionContribution(contribution.contributionId, ["awaiting_payment", "cancelled"], { state: "held" }, now) };
        }
        // A share completed after its bar filled, closed or passed its deadline:
        // release it at once, so nobody is charged for it.
        if (contribution.paymentRef) await deps.payment.release(contribution.paymentRef);
        return { applied: store.transitionContribution(contribution.contributionId, ["awaiting_payment", "cancelled", "held"], { state: "released" }, now) };
      }
      if (event.kind === "expired") return { applied: store.transitionContribution(contribution.contributionId, ["awaiting_payment"], { state: "cancelled" }, now) };
      if (event.kind === "refunded") {
        // One person's withdrawal or refund. The sector keeps running for everyone else; the owner is told.
        const applied = store.transitionContribution(contribution.contributionId, ["captured"], { state: "refunded" }, now);
        // Refunds the service makes itself (bar not filled, sector not created) are not news.
        const sectorState = store.getSector(contribution.sectorId)?.state;
        const serviceRefund = sectorState === "funding" || sectorState === "cancelled" || sectorState === "refunded";
        if (applied && !serviceRefund) deps.alert("contribution_refunded", { sectorId: contribution.sectorId, contributionId: contribution.contributionId });
        return { applied };
      }
      deps.alert("payment_dispute", { sectorId: contribution.sectorId, contributionId: contribution.contributionId });
      return { applied: false };
    }
  };
};

export type FundingService = ReturnType<typeof createFundingService>;
