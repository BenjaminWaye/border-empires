/**
 * On-demand release of stranded FRONTIER tiles (docs/stranded-frontier-cleanup-plan.md).
 *
 * Two triggers, both bounded so neither can stall the sim main thread:
 * - `releaseIfStrandedOrigin`: EXPAND/ATTACK from a FRONTIER origin. Usually
 *   resolved by the origin's own 8 neighbours; the slow path explores at most
 *   ORIGIN_MAX_VISITED tiles.
 * - `checkRegion`: one CHUNK_SIZE x CHUNK_SIZE region a player is looking at
 *   (forwarded by the gateway at most once per chunk per session). Scans the
 *   region once and explores at most REGION_MAX_VISITED tiles per owner.
 *
 * A stranded tile decays instantly under the encirclement rule, so both paths
 * release it through the same clearing code as encirclement. Out-of-reach decay
 * (timer-based) is a separate mechanic and is not touched here: a tile that is
 * out of reach but still connected stays a valid origin.
 */

import type { CommandEnvelope } from "@border-empires/sim-protocol";
import { CHUNK_SIZE, WORLD_HEIGHT, WORLD_WIDTH, wrapX, wrapY } from "@border-empires/shared";
import { simulationTileKey } from "../seed-state/seed-state.js";
import {
  activeAetherBridgeNeighborKeysForPlayer,
  clearCutOffFrontierTiles,
  type RuntimeEncirclementApplicationContext
} from "../runtime-encirclement-application.js";
import { findStrandedFrontier } from "./stranded-frontier-finder.js";
import { incrementStrandedFrontierCounter } from "./stranded-frontier-metrics.js";

export const ORIGIN_MAX_VISITED = 512;
export const REGION_MAX_VISITED = 2_000;
export const REGION_CHUNKS_X = Math.ceil(WORLD_WIDTH / CHUNK_SIZE);
export const REGION_CHUNKS_Y = Math.ceil(WORLD_HEIGHT / CHUNK_SIZE);

export type StrandedFrontierCleanup = {
  /** True when the origin was stranded and has just been released (the command must be rejected). */
  releaseIfStrandedOrigin: (originKey: string, ownerId: string, commandId: string) => boolean;
  /** Releases stranded frontier tiles of every owner in chunk (cx, cy). Returns the tiles released. */
  checkRegion: (cx: unknown, cy: unknown, commandId: string) => number;
};

// Barbarian territory is not supply-connected the way player territory is,
// so it is never swept here (fail open: leaving a tile owned is the safe side).
const isBarbarianOwner = (ownerId: string): boolean => ownerId.startsWith("barbarian-");

export const isValidStrandedRegion = (cx: unknown, cy: unknown): cx is number =>
  Number.isInteger(cx) && Number.isInteger(cy) &&
  (cx as number) >= 0 && (cx as number) < REGION_CHUNKS_X &&
  (cy as number) >= 0 && (cy as number) < REGION_CHUNKS_Y;

export function createStrandedFrontierCleanup(
  getContext: () => RuntimeEncirclementApplicationContext
): StrandedFrontierCleanup {
  const releaseStranded = (
    context: RuntimeEncirclementApplicationContext,
    ownerId: string,
    seedKeys: Iterable<string>,
    maxVisited: number,
    commandId: string
  ): number => {
    let bridgeNeighbors: Map<string, string[]> | undefined;
    const result = findStrandedFrontier({
      seedKeys,
      ownerId,
      getTile: (key) => context.tiles.get(key),
      // Built lazily: the fast path never needs it.
      extraNeighborKeys: (key) => {
        bridgeNeighbors ??= activeAetherBridgeNeighborKeysForPlayer(context, ownerId);
        return bridgeNeighbors.get(key) ?? [];
      },
      maxVisited
    });
    if (result.capped) incrementStrandedFrontierCounter("capHits");
    if (result.stranded.length === 0) return 0;
    const tileDeltas = clearCutOffFrontierTiles(context, result.stranded, commandId, context.now());
    if (tileDeltas.length > 0) {
      context.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId, playerId: ownerId, tileDeltas });
      incrementStrandedFrontierCounter("tilesReleased", tileDeltas.length);
    }
    return tileDeltas.length;
  };

  return {
    releaseIfStrandedOrigin: (originKey, ownerId, commandId) => {
      if (isBarbarianOwner(ownerId)) return false;
      const context = getContext();
      const origin = context.tiles.get(originKey);
      if (!origin || origin.ownerId !== ownerId || origin.ownershipState !== "FRONTIER") return false;
      incrementStrandedFrontierCounter("originChecks");
      if (hasSupplyNeighbor(context, origin.x, origin.y, ownerId) || origin.dockId) return false;
      incrementStrandedFrontierCounter("originSlowPath");
      const released = releaseStranded(context, ownerId, [originKey], ORIGIN_MAX_VISITED, commandId);
      const originReleased = released > 0 && context.tiles.get(originKey)?.ownerId !== ownerId;
      if (originReleased) incrementStrandedFrontierCounter("originReleased");
      return originReleased;
    },
    checkRegion: (cx, cy, commandId) => {
      if (!isValidStrandedRegion(cx, cy)) {
        incrementStrandedFrontierCounter("regionInvalid");
        return 0;
      }
      incrementStrandedFrontierCounter("regionChecks");
      const context = getContext();
      const seedsByOwner = new Map<string, string[]>();
      const chunkY = cy as number;
      const xEnd = Math.min((cx + 1) * CHUNK_SIZE, WORLD_WIDTH);
      const yEnd = Math.min((chunkY + 1) * CHUNK_SIZE, WORLD_HEIGHT);
      for (let y = chunkY * CHUNK_SIZE; y < yEnd; y += 1) {
        for (let x = cx * CHUNK_SIZE; x < xEnd; x += 1) {
          const key = simulationTileKey(x, y);
          const tile = context.tiles.get(key);
          if (!tile?.ownerId || tile.ownershipState !== "FRONTIER" || isBarbarianOwner(tile.ownerId)) continue;
          const seeds = seedsByOwner.get(tile.ownerId);
          if (seeds) seeds.push(key);
          else seedsByOwner.set(tile.ownerId, [key]);
        }
      }
      let released = 0;
      for (const [ownerId, seeds] of seedsByOwner) {
        released += releaseStranded(context, ownerId, seeds, REGION_MAX_VISITED, commandId);
      }
      return released;
    }
  };
}

/** CHECK_STRANDED_REGION: payload `{ cx, cy }` (chunk coordinates). Emits nothing unless tiles are released. */
export function handleCheckStrandedRegionCommand(cleanup: StrandedFrontierCleanup, command: CommandEnvelope): void {
  let payload: { cx?: unknown; cy?: unknown } = {};
  try {
    const parsed: unknown = JSON.parse(command.payloadJson);
    if (parsed && typeof parsed === "object") payload = parsed as { cx?: unknown; cy?: unknown };
  } catch {
    // Malformed payload falls through to checkRegion's validation, which counts it.
  }
  cleanup.checkRegion(payload.cx, payload.cy, command.commandId);
}

// Fast path for the origin check: one ring of 8 lookups settles the common case.
const hasSupplyNeighbor = (
  context: RuntimeEncirclementApplicationContext,
  x: number,
  y: number,
  ownerId: string
): boolean => {
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const neighbor = context.tiles.get(simulationTileKey(wrapX(x + dx, WORLD_WIDTH), wrapY(y + dy, WORLD_HEIGHT)));
      if (!neighbor || neighbor.ownerId !== ownerId) continue;
      if (neighbor.ownershipState === "SETTLED" || (neighbor.ownershipState === "FRONTIER" && neighbor.dockId)) return true;
    }
  }
  return false;
};
