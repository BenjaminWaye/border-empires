/** Current per-campaign state only. Expired records are pruned; no event history. */
export interface AfcCampaignState {
  /** At most one unexpired recharge deadline per tile per contributing House. */
  fortWardRecharges?: Record<string, number>;
  forcedTruceCooldownUntil?: number;
  /** Fortification Patterns: free Forts this House has already built. */
  freeFortsUsed?: number;
  /** Resonance Hijack: earliest time this House may start another takeover. */
  hijackReadyAt?: number;
}
export const AFC_CAMPAIGN_RECORD_LIMIT = 4096;
export function cloneAfcCampaignState(state: AfcCampaignState): AfcCampaignState {
  return { ...state, ...(state.fortWardRecharges ? { fortWardRecharges: { ...state.fortWardRecharges } } : {}) };
}
