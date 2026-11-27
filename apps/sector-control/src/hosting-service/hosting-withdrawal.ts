// A consumer's withdrawal from the contract (Terms of Sale section 7;
// docs/legal-drafts/README.md, "What the code and settings must do before
// sales open", items 1 and 6).
//
// Whoever paid can withdraw until the end of the 14th day after the day they
// paid, and until the sector's contest has ended (the right ends then, as the
// buyer acknowledged at checkout). They get back what they paid less one
// thirtieth for each started 24-hour period the sector was open.
//
// A first request quotes the amounts and names the purchase (the
// confirmation step); a confirmed one for that same purchase records the
// withdrawal and closes the purchase at once: the whole sector, or one share
// (whose owner then leaves the sector, which keeps running for the others).
// The refund follows, and is retried by the reconciler until the payment
// provider accepts it, so a failure never leaves the money unreturned.
import type { ContributionRecord, HostingStore, SectorRecord, WithdrawalRecord } from "../hosting-store/hosting-store.js";
import type { HostingAlert, PaymentProvider } from "../providers/providers.js";

const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * The period ends 14 days after the day of payment (Terms of Sale section 7),
 * at the end of that day. 15 times 24 hours from the moment of payment always
 * reaches the end of the 14th following day, wherever the buyer is, so no
 * one is refused early; a few extra hours are the seller's to give.
 */
export const WITHDRAWAL_PERIOD_MS = 15 * DAY_MS;
/** States in which the sector has been paid for and its contest has not ended. */
const WITHDRAWABLE_STATES: readonly SectorRecord["state"][] = ["creating", "open"];

export type WithdrawalQuote = {
  /** Names the purchase: the confirmed withdrawal must give it back, so it acts on what was quoted. */
  purchaseKey: string;
  paidCents: number;
  /** Started 24-hour periods the sector has been open (0 if it has not opened yet). */
  daysOpen: number;
  deductionCents: number;
  refundCents: number;
  /** The last moment a withdrawal is accepted, unless the contest ends first. */
  deadline: number;
};

/** The deduction: one thirtieth of what was paid for each started 24-hour period since the sector opened. */
export const withdrawalQuote = (purchaseKey: string, paidCents: number, paidAt: number, openedAt: number | undefined, now: number): WithdrawalQuote => {
  const daysOpen = openedAt === undefined || now <= openedAt ? 0 : Math.ceil((now - openedAt) / DAY_MS);
  const deductionCents = Math.min(paidCents, Math.round((paidCents * daysOpen) / 30));
  return { purchaseKey, paidCents, daysOpen, deductionCents, refundCents: paidCents - deductionCents, deadline: paidAt + WITHDRAWAL_PERIOD_MS };
};

type Fail = { ok: false; code: "NOT_FOUND" | "WITHDRAWAL_NOT_AVAILABLE"; message: string };
const fail = (code: Fail["code"], message: string): Fail => ({ ok: false, code, message });

/** What this account paid for in this sector: the whole sector, or its own captured share. */
type Purchase = { sector: SectorRecord; contribution?: ContributionRecord; paymentRef: string; paidCents: number; key: string };

export const createWithdrawalService = (deps: { store: HostingStore; payment: PaymentProvider; alert: HostingAlert; now: () => number }) => {
  const { store } = deps;

  const purchaseOf = (accountUid: string, sectorId: string): Purchase | Fail => {
    const sector = store.getSector(sectorId);
    if (!sector || !store.getMember(sectorId, accountUid)) return fail("NOT_FOUND", "No such sector.");
    const share = store.listContributions(sectorId).find((c) => c.accountUid === accountUid && c.state === "captured" && c.paymentRef);
    if (share?.paymentRef) return { sector, contribution: share, paymentRef: share.paymentRef, paidCents: share.amountCents, key: share.contributionId };
    if (sector.hostUid === accountUid && sector.paymentRef && sector.consent) return { sector, paymentRef: sector.paymentRef, paidCents: sector.amountCents, key: sector.sectorId };
    return fail("WITHDRAWAL_NOT_AVAILABLE", "You have no payment for this sector to withdraw from.");
  };

  /** Undefined when withdrawing is possible now; otherwise why not. */
  const unavailable = (purchase: Purchase, now: number): string | undefined => {
    const { sector } = purchase;
    if (sector.paidAt === undefined) return "This sector has not been paid for yet.";
    if (sector.endedAt !== undefined || !WITHDRAWABLE_STATES.includes(sector.state)) return "The right to withdraw ended when this sector's Sector Contest ended.";
    if (now > sector.paidAt + WITHDRAWAL_PERIOD_MS) return "The 14-day withdrawal period for this purchase has passed.";
    return undefined;
  };

  /** Sends the refund once; true when the payment provider accepted it (now or earlier). */
  const sendRefund = async (withdrawal: WithdrawalRecord): Promise<boolean> => {
    if (withdrawal.refundedAt !== undefined) return true;
    try {
      if (withdrawal.refundCents > 0) {
        await deps.payment.refund(withdrawal.paymentRef, { amountCents: withdrawal.refundCents, idempotencyKey: `withdrawal-${withdrawal.withdrawalKey}` });
      }
      store.markWithdrawalRefunded(withdrawal.withdrawalKey, deps.now());
      return true;
    } catch (error) {
      deps.alert("sector_refund_failed", { sectorId: withdrawal.sectorId, withdrawal: withdrawal.withdrawalKey, error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  };

  return {
    /** Whether this account could withdraw from its purchase in this sector now; shown as the button. */
    canWithdraw(accountUid: string, sectorId: string): boolean {
      const purchase = purchaseOf(accountUid, sectorId);
      return !("ok" in purchase) && !store.getWithdrawal(purchase.key) && unavailable(purchase, deps.now()) === undefined;
    },

    /** The confirmation step: what would be refunded, for which purchase, and nothing done. */
    quote(accountUid: string, sectorId: string): { ok: true; quote: WithdrawalQuote } | Fail {
      const purchase = purchaseOf(accountUid, sectorId);
      if ("ok" in purchase) return purchase;
      const now = deps.now();
      if (store.getWithdrawal(purchase.key)) return fail("WITHDRAWAL_NOT_AVAILABLE", "You have already withdrawn from this purchase.");
      const reason = unavailable(purchase, now);
      if (reason) return fail("WITHDRAWAL_NOT_AVAILABLE", reason);
      return { ok: true, quote: withdrawalQuote(purchase.key, purchase.paidCents, purchase.sector.paidAt ?? now, purchase.sector.openedAt, now) };
    },

    /**
     * The confirmed withdrawal of the quoted purchase. Recorded first (so the
     * deduction cannot change), the purchase closed at once, then the refund
     * sent. Repeating it returns the same withdrawal.
     */
    async withdraw(accountUid: string, sectorId: string, purchaseKey: unknown): Promise<{ ok: true; withdrawal: WithdrawalRecord; refundPending: boolean } | Fail> {
      if (typeof purchaseKey !== "string" || purchaseKey === "") return fail("WITHDRAWAL_NOT_AVAILABLE", "Open the withdrawal again to see what you would get back.");
      const earlier = store.getWithdrawal(purchaseKey);
      if (earlier) {
        if (earlier.accountUid !== accountUid || earlier.sectorId !== sectorId) return fail("NOT_FOUND", "No such sector.");
        const refunded = await sendRefund(earlier);
        return { ok: true, withdrawal: store.getWithdrawal(purchaseKey) ?? earlier, refundPending: !refunded };
      }
      const purchase = purchaseOf(accountUid, sectorId);
      if ("ok" in purchase) return purchase;
      // Only what was quoted: never another purchase the account holds here.
      if (purchase.key !== purchaseKey) return fail("WITHDRAWAL_NOT_AVAILABLE", "This purchase has changed since you opened the withdrawal. Open it again.");
      const now = deps.now();
      const reason = unavailable(purchase, now);
      if (reason) return fail("WITHDRAWAL_NOT_AVAILABLE", reason);
      const quote = withdrawalQuote(purchase.key, purchase.paidCents, purchase.sector.paidAt ?? now, purchase.sector.openedAt, now);
      const withdrawal: WithdrawalRecord = {
        withdrawalKey: purchase.key, sectorId, accountUid, paymentRef: purchase.paymentRef,
        paidCents: quote.paidCents, deductionCents: quote.deductionCents, refundCents: quote.refundCents, requestedAt: now,
        ...(purchase.contribution ? { contributionId: purchase.contribution.contributionId } : {})
      };
      // Two confirmations at once: only the first records and closes.
      if (!store.insertWithdrawal(withdrawal)) {
        const first = store.getWithdrawal(purchaseKey);
        return first ? { ok: true, withdrawal: first, refundPending: first.refundedAt === undefined } : fail("WITHDRAWAL_NOT_AVAILABLE", "Open the withdrawal again.");
      }
      if (purchase.contribution) {
        // One share: its owner leaves the sector, which keeps running for everyone else.
        store.transitionContribution(purchase.contribution.contributionId, ["captured"], { state: "refunded" }, now);
        store.removeMember(sectorId, accountUid);
      } else {
        // The whole sector: closed, and its server deleted by the reconciler.
        store.transitionSector(sectorId, WITHDRAWABLE_STATES, { state: "refunded" }, now);
      }
      deps.alert("withdrawal", { sectorId, withdrawal: withdrawal.withdrawalKey, refundCents: withdrawal.refundCents, share: purchase.contribution ? 1 : 0 });
      const refunded = await sendRefund(withdrawal);
      return { ok: true, withdrawal: store.getWithdrawal(purchaseKey) ?? withdrawal, refundPending: !refunded };
    },

    /** The reconciler's part: send every refund the payment provider has not accepted yet. */
    async retryPendingRefunds(): Promise<void> {
      for (const withdrawal of store.listPendingWithdrawals()) await sendRefund(withdrawal);
    }
  };
};

export type WithdrawalService = ReturnType<typeof createWithdrawalService>;
