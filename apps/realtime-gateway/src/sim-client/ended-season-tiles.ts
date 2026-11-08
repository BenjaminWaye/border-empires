import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import type { PlayerSubscriptionSnapshot, SimulationSeasonState } from "@border-empires/sim-protocol";

type Tiles = PlayerSubscriptionSnapshot["tiles"];
type Season = Pick<SimulationSeasonState, "seasonId" | "status">;

// Exactly one immutable world, replaced on rollover. This preserves sharing
// across the gRPC boundary: twenty AI/player subscriptions must not retain
// twenty copies of the same 204800-tile ended-season overview.
export const createEndedSeasonTileCache = (worldTileCount = WORLD_WIDTH * WORLD_HEIGHT): {
  read: (season: Season | undefined, tileCount: number, normalize: () => Tiles) => Tiles;
} => {
  let cached: { seasonId: string; tiles: Tiles } | undefined;
  return {
    read: (season, tileCount, normalize) => {
      if (season?.status !== "ended") {
        cached = undefined;
        return normalize();
      }
      if (cached?.seasonId !== season.seasonId) cached = undefined;
      // Omitted/partial tile replies must stay partial; they are not a full map.
      if (tileCount !== worldTileCount) return normalize();
      if (cached) return cached.tiles;
      const tiles = normalize();
      cached = { seasonId: season.seasonId, tiles };
      return tiles;
    }
  };
};
