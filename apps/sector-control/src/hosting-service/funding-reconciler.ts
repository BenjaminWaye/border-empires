// The reconciler's part of split funding: settle shares whose webhook may be
// missing, capture every hold once the bar is full, and release everything
// when the deadline passes. Each step is guarded by the state it expects, so a
// pass can stop at any point and the next one carries on.
import type { ContributionRecord, HostingStore, SectorRecord } from "../hosting-store/hosting-store.js";
import type { HostingAlert, PaymentProvider } from "../providers/providers.js";
import type { HostingConfig } from "./hosting-config.js";
import { fundingTotals } from "./hosting-funding.js";

export const createFundingReconciler = (deps: { store: HostingStore; payment: PaymentProvider; alert: HostingAlert; config: HostingConfig }) => {
  const { store, config } = deps;

  /** A share whose checkout has outlived its lifetime: ask the provider, in case a webhook was missed. */
  const settleStale = async (contribution: ContributionRecord, now: number): Promise<void> => {
    if (contribution.state !== "awaiting_payment" || now - contribution.createdAt < config.checkoutExpiryMs) return;
    const status = contribution.paymentRef ? await deps.payment.getContributionStatus(contribution.paymentRef) : "expired";
    if (status === "held") store.transitionContribution(contribution.contributionId, ["awaiting_payment"], { state: "held" }, now);
    else if (status === "expired") store.transitionContribution(contribution.contributionId, ["awaiting_payment"], { state: "cancelled" }, now);
  };

  /** Gives every share back: holds released, captured money refunded, open checkouts closed. */
  const unwind = async (sector: SectorRecord, now: number): Promise<boolean> => {
    let complete = true;
    for (const contribution of store.listContributions(sector.sectorId)) {
      if (!contribution.paymentRef) continue;
      try {
        if (contribution.state === "held" || contribution.state === "awaiting_payment") {
          await deps.payment.release(contribution.paymentRef);
          store.transitionContribution(contribution.contributionId, ["held", "awaiting_payment"], { state: "released" }, now);
        } else if (contribution.state === "captured") {
          await deps.payment.refund(contribution.paymentRef);
          store.transitionContribution(contribution.contributionId, ["captured"], { state: "refunded" }, now);
        }
      } catch (error) {
        complete = false;
        deps.alert("sector_refund_failed", { sectorId: sector.sectorId, contributionId: contribution.contributionId, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return complete;
  };

  return {
    unwind,

    /** One step for a sector in "funding". */
    async step(sector: SectorRecord, now: number): Promise<void> {
      for (const contribution of store.listContributions(sector.sectorId)) await settleStale(contribution, now);
      const contributions = store.listContributions(sector.sectorId);
      const { pledgedCents } = fundingTotals(contributions, now, config.checkoutExpiryMs);

      if (pledgedCents >= sector.amountCents) {
        // Full: take held shares, first held first, up to the price; any share
        // beyond it (a late checkout completing after the bar filled) is
        // released, so nobody pays more than the sector costs. A share that
        // can no longer be taken (hold lapsed, card declined) is dropped and
        // the bar stays open for someone to cover it.
        let taken = contributions.filter((c) => c.state === "captured").reduce((sum, c) => sum + c.amountCents, 0);
        // In the order the holds were placed: whoever committed first is charged first.
        const held = contributions.filter((c) => c.state === "held").sort((x, y) => x.updatedAt - y.updatedAt);
        for (const contribution of held) {
          if (!contribution.paymentRef) continue;
          if (taken >= sector.amountCents) {
            await deps.payment.release(contribution.paymentRef);
            store.transitionContribution(contribution.contributionId, ["held"], { state: "released" }, now);
            continue;
          }
          try {
            await deps.payment.capture(contribution.paymentRef);
            store.transitionContribution(contribution.contributionId, ["held"], { state: "captured" }, now);
            taken += contribution.amountCents;
          } catch (error) {
            store.transitionContribution(contribution.contributionId, ["held"], { state: "released" }, now);
            deps.alert("contribution_capture_failed", { sectorId: sector.sectorId, contributionId: contribution.contributionId, error: error instanceof Error ? error.message : String(error) });
          }
        }
        const captured = store.listContributions(sector.sectorId).filter((c) => c.state === "captured").reduce((sum, c) => sum + c.amountCents, 0);
        if (captured >= sector.amountCents) {
          store.transitionSector(sector.sectorId, ["funding"], { state: "creating", paidAt: now, createAttempts: 0 }, now);
        }
        return;
      }

      if (sector.fundingDeadline !== undefined && now >= sector.fundingDeadline) {
        // Not filled in time (Q10): nobody pays. The sector closes once every share is given back.
        if (await unwind(sector, now)) store.transitionSector(sector.sectorId, ["funding"], { state: "cancelled" }, now);
      }
    }
  };
};
