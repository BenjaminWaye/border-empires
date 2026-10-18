/** Current per-campaign state only. Expired records are pruned; no event history. */
export interface AfcCampaignState {
  /** At most one unexpired recharge deadline per tile per contributing House. */
  fortWardRecharges?: Record<string, number>;
  /** Most recent hostile capture in either direction, expires after 24h. */
  wars?: Record<string, number>;
  forcedTruceCooldownUntil?: number;
}
export const AFC_CAMPAIGN_RECORD_LIMIT = 4096;
export function cloneAfcCampaignState(state: AfcCampaignState): AfcCampaignState {
  return { ...state, ...(state.fortWardRecharges ? { fortWardRecharges: { ...state.fortWardRecharges } } : {}), ...(state.wars ? { wars: { ...state.wars } } : {}) };
}
