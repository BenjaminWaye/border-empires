// A consumer's withdrawal from the contract (Terms of Sale section 7;
// docs/legal-drafts/README.md, "What the code and settings must do before
// sales open", items 1 and 6).
//
// Whoever paid can withdraw within 14 days of paying, until the sector's
// contest has ended (the right ends then, as the buyer acknowledged at
// checkout). They get back the price less one thirtieth for each started
// 24-hour period the sector was open. A purchase in full closes the sector;
// one share of a split-funded sector is refunded on its own and the sector
// keeps running for the others. A first request quotes the amounts (the
// confirmation step); only a second, confirmed one acts.
import type { ContributionRecord, HostingStore, SectorRecord, WithdrawalRecord } from "../hosting-store/hosting-store.js";
import type { HostingAlert, PaymentProvider } from "../providers/providers.js";

const DAY_MS = 24 * 60 * 60 * 1000;
export const WITHDRAWAL_PERIOD_MS = 14 * DAY_MS;
/** States in which the sector has been paid for and its contest has not ended. */
const WITHDRAWABLE_STATES: readonly SectorRecord["state"][] = ["creating", "open"];

export type WithdrawalQuote = {
  paidCents: number;
  /** Started 24-hour periods the sector has been open (0 if it has not opened yet). */
  daysOpen: number;
  deductionCents: number;
  refundCents: number;
  /** The last moment a withdrawal is accepted, unless the contest ends first. */
  deadline: number;
};

/** The deduction: one thirtieth of what was paid for each started 24-hour period since the sector opened. */
export const withdrawalQuote = (paidCents: number, paidAt: number, openedAt: number | undefined, now: number): WithdrawalQuote => {
  const daysOpen = openedAt === undefined || now <= openedAt ? 0 : Math.ceil((now - openedAt) / DAY_MS);
  const deductionCents = Math.min(paidCents, Math.round((paidCents * daysOpen) / 30));
  return { paidCents, daysOpen, deductionCents, refundCents: paidCents - deductionCents, deadline: paidAt + WITHDRAWAL_PERIOD_MS };
};

type Fail = { ok: false; code: "NOT_FOUND" | "WITHDRAWAL_NOT_AVAILABLE" | "PAYMENT_UNAVAILABLE"; message: string };
const fail = (code: Fail["code"], message: string): Fail => ({ ok: false, code, message });

/** What this account paid for in this sector: the whole sector, or its own captured share. */
type Purchase = { sector: SectorRecord; contribution?: ContributionRecord & { paymentRef: string }; paymentRef: string; paidCents: number; key: string };

export const createWithdrawalService = (deps: { store: HostingStore; payment: PaymentProvider; alert: HostingAlert; now: () => number }) => {
  const { store } = deps;

  const purchaseOf = (accountUid: string, sectorId: string): Purchase | Fail => {
    const sector = store.getSector(sectorId);
    if (!sector || !store.getMember(sectorId, accountUid)) return fail("NOT_FOUND", "No such sector.");
    const share = store.listContributions(sectorId).find((c) => c.accountUid === accountUid && c.state === "captured" && c.paymentRef);
    if (share?.paymentRef) return { sector, contribution: { ...share, paymentRef: share.paymentRef }, paymentRef: share.paymentRef, paidCents: share.amountCents, key: share.contributionId };
    if (sector.hostUid === accountUid && sector.paymentRef && sector.consent) return { sector, paymentRef: sector.paymentRef, paidCents: sector.amountCents, key: sector.sectorId };
    return fail("WITHDRAWAL_NOT_AVAILABLE", "You have no payment for this sector to withdraw from.");
  };

  /** Undefined when withdrawing is possible now; otherwise why not. */
  const unavailable = (purchase: Purchase, now: number): string | undefined => {
    const { sector } = purchase;
    if (store.getWithdrawal(purchase.key)) return "You have already withdrawn from this purchase.";
    if (sector.paidAt === undefined) return "This sector has not been paid for yet.";
    if (sector.endedAt !== undefined || !WITHDRAWABLE_STATES.includes(sector.state)) return "The right to withdraw ended when this sector's Sector Contest ended.";
    if (now > sector.paidAt + WITHDRAWAL_PERIOD_MS) return "The 14-day withdrawal period for this purchase has passed.";
    return undefined;
  };

  return {
    /** Whether this account could withdraw from its purchase in this sector now; shown as the button. */
    canWithdraw(accountUid: string, sectorId: string): boolean {
      const purchase = purchaseOf(accountUid, sectorId);
      return !("ok" in purchase) && unavailable(purchase, deps.now()) === undefined;
    },

    /** The confirmation step: what would be refunded, and nothing done. */
    quote(accountUid: string, sectorId: string): { ok: true; quote: WithdrawalQuote } | Fail {
      const purchase = purchaseOf(accountUid, sectorId);
      if ("ok" in purchase) return purchase;
      const now = deps.now();
      const reason = unavailable(purchase, now);
      if (reason) return fail("WITHDRAWAL_NOT_AVAILABLE", reason);
      return { ok: true, quote: withdrawalQuote(purchase.paidCents, purchase.sector.paidAt ?? now, purchase.sector.openedAt, now) };
    },

    /**
     * The confirmed withdrawal: recorded first (so the deduction cannot change
     * on a retry), then refunded with an idempotency key, then the purchase closed.
     */
    async withdraw(accountUid: string, sectorId: string): Promise<{ ok: true; withdrawal: WithdrawalRecord } | Fail> {
      const purchase = purchaseOf(accountUid, sectorId);
      if ("ok" in purchase) return purchase;
      const now = deps.now();
      const earlier = store.getWithdrawal(purchase.key);
      let withdrawal = earlier;
      if (!withdrawal) {
        const reason = unavailable(purchase, now);
        if (reason) return fail("WITHDRAWAL_NOT_AVAILABLE", reason);
        const quote = withdrawalQuote(purchase.paidCents, purchase.sector.paidAt ?? now, purchase.sector.openedAt, now);
        withdrawal = {
          withdrawalKey: purchase.key, sectorId, accountUid, paidCents: quote.paidCents, deductionCents: quote.deductionCents, refundCents: quote.refundCents, requestedAt: now,
          ...(purchase.contribution ? { contributionId: purchase.contribution.contributionId } : {})
        };
        store.insertWithdrawal(withdrawal);
      }
      try {
        if (withdrawal.refundCents > 0) {
          await deps.payment.refund(purchase.paymentRef, { amountCents: withdrawal.refundCents, idempotencyKey: `withdrawal-${withdrawal.withdrawalKey}` });
        }
      } catch {
        // Recorded: a retry repeats the same refund. The owner is told meanwhile.
        deps.alert("sector_refund_failed", { sectorId, withdrawal: withdrawal.withdrawalKey });
        return fail("PAYMENT_UNAVAILABLE", "Your withdrawal is recorded, but the refund could not be sent yet. Try again in a while; we have been told.");
      }
      if (purchase.contribution) {
        // One share: the sector keeps running for everyone else.
        store.transitionContribution(purchase.contribution.contributionId, ["captured"], { state: "refunded" }, now);
      } else {
        // The whole sector: closed, and its server deleted by the reconciler.
        store.transitionSector(sectorId, ["creating", "open", "ended"], { state: "refunded" }, now);
      }
      deps.alert("contribution_refunded", { sectorId, withdrawal: withdrawal.withdrawalKey, refundCents: withdrawal.refundCents });
      return { ok: true, withdrawal };
    }
  };
};

export type WithdrawalService = ReturnType<typeof createWithdrawalService>;
