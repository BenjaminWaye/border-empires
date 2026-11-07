import type { PlayerRuntimeSummary } from "../player-runtime-summary.js";
import type { DomainPlayer } from "@border-empires/game-domain";
/** Guard counters are fixed-size process diagnostics, never persisted as history. */
export const afcCampaignGuardCounters = { wardEvictions: 0 };
export function afcCampaignStateGauges(players: Iterable<DomainPlayer>): { wardEntries: number; pendingDeliveries: number } {
  let wardEntries = 0;
  let pendingDeliveries = 0;
  for (const player of players) {
    wardEntries += Object.keys(player.afcCampaign?.fortWardRecharges ?? {}).length;
    if (player.afcRecovery?.pending) pendingDeliveries++;
  }
  return { wardEntries, pendingDeliveries };
}

export function afcRecoverySearchCount(summaries: Iterable<Pick<PlayerRuntimeSummary, "afcRecoverySiteCursor">>): number {
  let count = 0;
  for (const summary of summaries) if (summary.afcRecoverySiteCursor) count++;
  return count;
}
