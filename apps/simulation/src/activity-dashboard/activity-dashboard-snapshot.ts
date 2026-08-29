// Builds the sim-computed half of GET /api/activity's response (see
// packages/game-domain/src/activity-dashboard-types.ts for the shared
// ActivityDashboardSnapshot shape and simulation-service.ts's
// GetActivityDashboard RPC handler, which is the only caller). The gateway
// merges this with its own social-state views (alliances/breaks/truces) and
// the existing leaderboard to produce the full response --
// activity-api-response.ts in apps/realtime-gateway.
import type { ActivityDashboardSnapshot } from "@border-empires/game-domain";
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";

import {
  computeBiggestSwing24h,
  computeFrontlineHotspots,
  computeTerritoryMomentum,
  computeWars,
  orderedPairKey
} from "../territory-flip-log/territory-flip-log-aggregations.js";
import type { TerritoryFlip } from "../territory-flip-log/territory-flip-log.js";
import { computeFortificationRanking, type FortificationRankingTile } from "../fortification/fortification-ranking.js";

/**
 * Active-alliance pair keys, mirrored sim-side on `DomainPlayer.allies` by
 * SYNC_ALLIANCE (see runtime.ts) -- so computeWars can exclude allied pairs
 * without a cross-process call into the gateway's social state.
 */
export const alliedPairKeysFromPlayers = (players: ReadonlyMap<string, DomainPlayer>): Set<string> => {
  const keys = new Set<string>();
  for (const [playerId, player] of players) {
    for (const allyId of player.allies) keys.add(orderedPairKey(playerId, allyId));
  }
  return keys;
};

export const buildActivityDashboardSnapshot = (input: {
  tiles: ReadonlyMap<string, DomainTileState>;
  players: ReadonlyMap<string, DomainPlayer>;
  flipLogEntries: readonly TerritoryFlip[];
  now: number;
}): ActivityDashboardSnapshot => {
  const fortificationTiles: FortificationRankingTile[] = [...input.tiles.values()].map((tile) => ({
    ownerId: tile.ownerId,
    fort: tile.fort
  }));
  return {
    generatedAt: input.now,
    fortification: computeFortificationRanking(fortificationTiles),
    wars: computeWars(input.flipLogEntries, alliedPairKeysFromPlayers(input.players)),
    territoryMomentum: computeTerritoryMomentum(input.flipLogEntries),
    biggestSwing24h: computeBiggestSwing24h(input.flipLogEntries),
    frontlineHotspots: computeFrontlineHotspots(input.flipLogEntries)
  };
};
