// Extracted from metrics.ts (which sits at the repo's 500-line file cap) to make
// room for new metrics without growing that file past the cap.
export const createOwnershipChangeAlertMetrics = () => {
  let simOwnershipChangeAlertSkippedSettlementTierTotal = 0;

  return {
    snapshot: () => ({
      simOwnershipChangeAlertSkippedSettlementTierTotal
    }),
    // Fires each time onOwnershipChange skips the Town Lost Slack alert
    // because the captured town was SETTLEMENT tier (routine population
    // absorption, not a genuine loss) — zero forever means the skip never engages.
    incrementSimOwnershipChangeAlertSkippedSettlementTier(): void {
      simOwnershipChangeAlertSkippedSettlementTierTotal += 1;
    }
  };
};

export type OwnershipChangeAlertMetrics = ReturnType<typeof createOwnershipChangeAlertMetrics>;
