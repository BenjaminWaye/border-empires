import { simulationTileKey } from "./seed-state/seed-state.js";
import { isAiControlledActor } from "./runtime-player-factory.js";
import { effectiveVisionRadiusForPlayer } from "./tech-domain-bridge/tech-domain-bridge.js";
import type { RuntimeCombatSupportContext } from "./runtime-combat-support.js";
import type { RuntimePlayer, SimulationTileWireDelta } from "./runtime-types.js";

export const visibleRadiusForPlayer = (players: ReadonlyMap<string, RuntimePlayer>, playerId: string): number => {
  const player = players.get(playerId);
  return player ? effectiveVisionRadiusForPlayer(player) : 1;
};

export const buildCaptureRevealTileDeltas = (
  ctx: RuntimeCombatSupportContext,
  playerId: string,
  centerX: number,
  centerY: number
): SimulationTileWireDelta[] => {
  const radius = visibleRadiusForPlayer(ctx.players, playerId);
  const deltas = new Map<string, SimulationTileWireDelta>();
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const tile = ctx.tiles.get(simulationTileKey(centerX + dx, centerY + dy));
      if (!tile) continue;
      deltas.set(simulationTileKey(tile.x, tile.y), ctx.tileDeltaRevealOnly(tile, playerId));
    }
  }
  return [...deltas.values()].sort((left, right) => (left.x - right.x) || (left.y - right.y));
};

/**
 * Reveal-only deltas around many centers at once, deduped into a single sorted
 * batch. Reveals the fog around a cluster of tiles the way a single capture does
 * (see buildCaptureRevealTileDeltas), but without emitting overlapping deltas for
 * the shared fog between adjacent centers.
 */
export const buildRevealTileDeltasForCenters = (
  ctx: RuntimeCombatSupportContext,
  playerId: string,
  centers: Iterable<{ x: number; y: number }>
): SimulationTileWireDelta[] => {
  const radius = visibleRadiusForPlayer(ctx.players, playerId);
  const deltas = new Map<string, SimulationTileWireDelta>();
  for (const center of centers) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const key = simulationTileKey(center.x + dx, center.y + dy);
        if (deltas.has(key)) continue;
        const tile = ctx.tiles.get(key);
        if (!tile) continue;
        deltas.set(key, ctx.tileDeltaRevealOnly(tile, playerId));
      }
    }
  }
  return [...deltas.values()].sort((left, right) => (left.x - right.x) || (left.y - right.y));
};

// 8-neighbor offsets used to decide whether an auto-filled tile sits on the
// boundary of owned territory (and can therefore expose new fog to reveal).
const AUTO_FILL_REVEAL_NEIGHBOR_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1], [0, -1], [1, -1],
  [-1,  0],          [1,  0],
  [-1,  1], [0,  1], [1,  1],
];

/**
 * Reveal deltas for a batch of freshly auto-filled tiles owned by `playerId`.
 *
 * Only tiles on the *boundary* of owned territory (bordering fog/terrain/another
 * owner) can expose new fog — an interior tile whose every neighbor we already
 * own reveals nothing new, and a pocket sealed purely by our own settled ring is
 * already within that ring's vision. Filtering to boundary tiles bounds the
 * O(centers × VISION_RADIUS²) cost to the region perimeter. Returns [] for
 * AI-controlled actors, which have no client to reveal to.
 */
export const buildAutoFillRevealTileDeltas = (
  ctx: RuntimeCombatSupportContext,
  playerId: string,
  filledTiles: ReadonlyArray<{ x: number; y: number }>,
  isAi: boolean | undefined
): SimulationTileWireDelta[] => {
  if (isAiControlledActor(playerId, isAi)) return [];
  const boundary = filledTiles.filter((t) => AUTO_FILL_REVEAL_NEIGHBOR_OFFSETS.some(([dx, dy]) => {
    const n = ctx.tiles.get(simulationTileKey(t.x + dx, t.y + dy));
    return !n || n.ownerId !== playerId;
  }));
  if (boundary.length === 0) return [];
  return buildRevealTileDeltasForCenters(ctx, playerId, boundary);
};
