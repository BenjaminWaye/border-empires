import type { DomainPlayer } from "@border-empires/game-domain";
/** Guard counters are fixed-size process diagnostics, never persisted as history. */
export const afcCampaignGuardCounters = { wardEvictions: 0 };
export function afcCampaignStateGauges(players: Iterable<DomainPlayer>): { wardEntries: number } {
  let wardEntries = 0;
  for (const player of players) wardEntries += Object.keys(player.afcCampaign?.fortWardRecharges ?? {}).length;
  return { wardEntries };
}
