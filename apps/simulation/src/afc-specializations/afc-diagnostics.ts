import type { DomainPlayer } from "@border-empires/game-domain";
/** Guard counters are fixed-size process diagnostics, never persisted as history. */
export const afcCampaignGuardCounters = { warEvictions: 0, wardEvictions: 0 };
export function afcCampaignStateGauges(players: Iterable<DomainPlayer>): { warEntries: number; wardEntries: number } {
  let warEntries = 0;
  let wardEntries = 0;
  for (const player of players) { warEntries += Object.keys(player.afcCampaign?.wars ?? {}).length; wardEntries += Object.keys(player.afcCampaign?.fortWardRecharges ?? {}).length; }
  return { warEntries, wardEntries };
}

