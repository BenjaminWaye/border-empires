// The Diplomatic Dominance sizes the gateway's AI alliance-bloc check needs,
// counted the way the victory check counts them (season-victory-objectives.ts):
// each competitive player's controlled (SETTLED + FRONTIER) tiles times its
// diplomatic weight, against the world's LAND tile count. Carried on the
// season summary so an AI judges "how close is this bloc to winning" on the
// real metric, not the settled-only leaderboard count.
import type { SimulationRuntime } from "../runtime/runtime.js";

type RuntimeState = ReturnType<SimulationRuntime["exportState"]>;

/** Chancery V counts its holder's land twice toward a bloc's Dominance total. */
export const diplomaticDominanceWeight = (domainIds: readonly string[] | undefined): number =>
  domainIds?.includes("afc-chancery-5") ? 2 : 1;

export type DominanceSizes = {
  landTileCount: number;
  /** Weighted controlled tiles per competitive player that holds any. */
  dominanceTilesByPlayerId: Record<string, number>;
};

export const computeDominanceSizes = (
  tiles: RuntimeState["tiles"],
  players: RuntimeState["players"],
  competitivePlayerIds: ReadonlySet<string>
): DominanceSizes => {
  let landTileCount = 0;
  const controlled = new Map<string, number>();
  for (const tile of tiles) {
    if (tile.terrain === "LAND") landTileCount += 1;
    if (!tile.ownerId || !competitivePlayerIds.has(tile.ownerId)) continue;
    if (tile.ownershipState !== "SETTLED" && tile.ownershipState !== "FRONTIER") continue;
    controlled.set(tile.ownerId, (controlled.get(tile.ownerId) ?? 0) + 1);
  }
  const dominanceTilesByPlayerId: Record<string, number> = {};
  for (const player of players) {
    const count = controlled.get(player.id);
    if (count) dominanceTilesByPlayerId[player.id] = count * diplomaticDominanceWeight(player.domainIds);
  }
  return { landTileCount, dominanceTilesByPlayerId };
};
