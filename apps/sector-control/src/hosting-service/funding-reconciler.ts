// The reconciler's part of split funding: settle shares whose webhook may be
// missing, capture holds once the bar is full, and give everything back when
// the deadline passes. Each step is guarded by the state it expects, so a pass
// can stop at any point and the next one carries on. One share the provider
// cannot answer about never stops the others or the deadline.
import type { ContributionRecord, ContributionState, HostingStore, SectorRecord } from "../hosting-store/hosting-store.js";
import type { ContributionStatus, HostingAlert, PaymentProvider } from "../providers/providers.js";
import type { HostingConfig } from "./hosting-config.js";

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** What the provider's answer means for the record. "open" changes nothing. */
const STATE_FOR_STATUS: Record<ContributionStatus, ContributionState | undefined> = {
  open: undefined, held: "held", captured: "captured", released: "released", expired: "cancelled"
};

export const createFundingReconciler = (deps: { store: HostingStore; payment: PaymentProvider; alert: HostingAlert; config: HostingConfig }) => {
  const { store, config } = deps;

  /**
   * Brings a share's record in line with what really happened to its money,
   * and returns the state it now has. Money the provider took is recorded as
   * captured even if the record said otherwise, so it is never forgotten.
   */
  const syncFromProvider = async (contribution: ContributionRecord, now: number): Promise<ContributionState> => {
    if (!contribution.paymentRef) return contribution.state;
    const target = STATE_FOR_STATUS[await deps.payment.getContributionStatus(contribution.paymentRef)];
    if (!target || target === contribution.state) return contribution.state;
    const from: ContributionState[] = target === "captured" ? ["awaiting_payment", "held", "released", "cancelled"] : ["awaiting_payment", "held"];
    return store.transitionContribution(contribution.contributionId, from, { state: target }, now) ? target : contribution.state;
  };

  /** A share whose checkout has outlived its lifetime: ask the provider, in case a webhook was missed. */
  const settleStale = async (contribution: ContributionRecord, now: number): Promise<void> => {
    if (contribution.state !== "awaiting_payment" || now - contribution.createdAt < config.checkoutExpiryMs) return;
    if (!contribution.paymentRef) {
      store.transitionContribution(contribution.contributionId, ["awaiting_payment"], { state: "cancelled" }, now);
      return;
    }
    try {
      await syncFromProvider(contribution, now);
    } catch {
      // Asked again on the next pass; the deadline still applies meanwhile.
    }
  };

  /** Stops a share that is not needed: a hold is released, an unpaid checkout closed. Money already taken is refunded. */
  const giveBack = async (contribution: ContributionRecord, now: number): Promise<void> => {
    if (!contribution.paymentRef) {
      store.transitionContribution(contribution.contributionId, ["awaiting_payment"], { state: "cancelled" }, now);
      return;
    }
    let state = contribution.state;
    if (state === "held" || state === "awaiting_payment") {
      try {
        await deps.payment.release(contribution.paymentRef);
        store.transitionContribution(contribution.contributionId, ["held", "awaiting_payment"], { state: state === "held" ? "released" : "cancelled" }, now);
        return;
      } catch (error) {
        // Perhaps the money was taken after all: then it is refunded below.
        state = await syncFromProvider(contribution, now);
        if (state !== "captured") throw error;
      }
    }
    if (state === "captured") {
      await deps.payment.refund(contribution.paymentRef);
      store.transitionContribution(contribution.contributionId, ["captured"], { state: "refunded" }, now);
    }
  };

  /** Gives every share back: holds released, captured money refunded, open checkouts closed. */
  const unwind = async (sector: SectorRecord, now: number): Promise<boolean> => {
    let complete = true;
    for (const contribution of store.listContributions(sector.sectorId)) {
      try {
        await giveBack(contribution, now);
      } catch (error) {
        complete = false;
        deps.alert("sector_refund_failed", { sectorId: sector.sectorId, contributionId: contribution.contributionId, error: errorText(error) });
      }
    }
    return complete;
  };

  /** Takes up to `wanted` cents of a held share. Returns the cents now taken from it, or undefined to try again next pass. */
  const captureShare = async (sector: SectorRecord, contribution: ContributionRecord & { paymentRef: string }, wanted: number, now: number): Promise<number | undefined> => {
    try {
      await deps.payment.capture(contribution.paymentRef, wanted);
      store.transitionContribution(contribution.contributionId, ["held"], { state: "captured", amountCents: wanted }, now);
      return wanted;
    } catch (error) {
      deps.alert("contribution_capture_failed", { sectorId: sector.sectorId, contributionId: contribution.contributionId, error: errorText(error) });
      // The request may have gone through even though the answer did not arrive.
      let state: ContributionState;
      try {
        state = await syncFromProvider(contribution, now);
      } catch {
        return undefined;
      }
      if (state === "captured") {
        store.transitionContribution(contribution.contributionId, ["captured"], { amountCents: wanted }, now);
        return wanted;
      }
      // Still held: tried again next pass. Released or lapsed: dropped, and the bar stays open for someone to cover it.
      return state === "held" ? undefined : 0;
    }
  };

  return {
    unwind,

    /** One step for a sector in "funding". */
    async step(sector: SectorRecord, now: number): Promise<void> {
      for (const contribution of store.listContributions(sector.sectorId)) await settleStale(contribution, now);
      const contributions = store.listContributions(sector.sectorId);
      const deadline = sector.fundingDeadline ?? Number.POSITIVE_INFINITY;
      // Only holds placed before the deadline count (Q10): nobody is charged for a bar that filled late.
      const counted = contributions.filter((c) => c.state === "captured" || (c.state === "held" && c.updatedAt < deadline));
      const pledgedCents = counted.reduce((sum, c) => sum + c.amountCents, 0);

      if (pledgedCents >= sector.amountCents) {
        // Full: take held shares, first held first, up to the price. The
        // share that crosses the price is only partly taken and any beyond it
        // is released, so the shares together never cost more than the sector.
        let taken = counted.filter((c) => c.state === "captured").reduce((sum, c) => sum + c.amountCents, 0);
        const held = counted.filter((c) => c.state === "held").sort((x, y) => x.updatedAt - y.updatedAt);
        let retry = false;
        for (const contribution of held) {
          const { paymentRef } = contribution;
          if (!paymentRef || taken >= sector.amountCents) continue;
          const got = await captureShare(sector, { ...contribution, paymentRef }, Math.min(contribution.amountCents, sector.amountCents - taken), now);
          if (got === undefined) retry = true;
          else taken += got;
        }
        if (retry || taken < sector.amountCents) return;
        store.transitionSector(sector.sectorId, ["funding"], { state: "creating", paidAt: now, createAttempts: 0 }, now);
        // Everything not taken is given back: holds beyond the price, late holds, and checkouts still open.
        for (const contribution of store.listContributions(sector.sectorId)) {
          if (contribution.state !== "held" && contribution.state !== "awaiting_payment") continue;
          try {
            await giveBack(contribution, now);
          } catch (error) {
            deps.alert("sector_refund_failed", { sectorId: sector.sectorId, contributionId: contribution.contributionId, error: errorText(error) });
          }
        }
        return;
      }

      if (now >= deadline) {
        // Not filled in time (Q10): nobody pays. The sector closes once every share is given back.
        if (await unwind(sector, now)) store.transitionSector(sector.sectorId, ["funding"], { state: "cancelled" }, now);
      }
    }
  };
};
