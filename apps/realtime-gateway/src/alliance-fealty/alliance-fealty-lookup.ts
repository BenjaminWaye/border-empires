// How the gateway records an alliance offer's fealty when it is sent
// (alliance-fealty.ts in shared): from the season leaderboard's garrisoned
// tiles, the same count the client's Diplomacy list and deal screen show. The
// leaderboard is the one AI diplomacy already caches (season-leaderboard-cache.ts);
// a player missing from it, or no leaderboard yet, records near-equals.
import { allianceFealtyFromTiles } from "@border-empires/shared";

import type { SeasonSizes } from "../ai-diplomacy-stance/ai-alliance-bloc.js";
import type { SocialFealtyLookup } from "../social-state/social-state-types.js";

export const fealtyLookupFromSizes = (latest: () => SeasonSizes | undefined): SocialFealtyLookup => (fromPlayerId, toPlayerId) => {
  const entries = latest()?.tiles ?? [];
  const tilesOf = (playerId: string): number | undefined => entries.find((entry) => entry.id === playerId)?.tiles;
  return allianceFealtyFromTiles({ id: fromPlayerId, tiles: tilesOf(fromPlayerId) }, { id: toPlayerId, tiles: tilesOf(toPlayerId) });
};
