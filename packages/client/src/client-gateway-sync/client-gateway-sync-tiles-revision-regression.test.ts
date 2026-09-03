import { describe, expect, it } from "vitest";
import { applyGatewayTileDeltaBatch } from "./client-gateway-sync.js";
import type { Tile } from "../client-types.js";

const createDeps = () => {
  const state = {
    me: "me",
    tiles: new Map<string, Tile>(),
    tilesRevision: 0,
    incomingAttacksByTile: new Map<string, { attackerName: string; resolvesAt: number }>(),
    discoveredTiles: new Set<string>(),
    upkeepLastTick: {
      food: { need: 0, fromYield: 0, fromStock: 0, remaining: 0, contributors: [] },
      titanium: { need: 0, fromYield: 0, fromStock: 0, remaining: 0, contributors: [] },
      umbrite: { need: 0, fromYield: 0, fromStock: 0, remaining: 0, contributors: [] },
      crystal: { need: 0, fromYield: 0, fromStock: 0, remaining: 0, contributors: [] },
      gold: { need: 0, fromYield: 0, fromStock: 0, remaining: 0, contributors: [] },
      foodCoverage: 1
    },
    mods: { income: 1.0 }
  };
  return {
    state,
    keyFor: (x: number, y: number) => `${x},${y}`,
    mergeIncomingTileDetail: (_existing: Tile | undefined, incoming: Tile) => incoming,
    mergeServerTileWithOptimisticState: (tile: Tile) => tile
  };
};

// Regression for a live bug: TILE_DELTA_BATCH streams continuously as the
// server's economy ticks (yield/upkeep/history recompute on essentially
// every step) for every tile the player can see, and applyGatewayTileUpdate
// bumped tilesRevision on every single one of those deltas unconditionally
// -- even though neither map renderer reads yield/yieldRate/yieldCap/
// upkeepEntries/history at all. tilesRevision is the only signal the
// true-3D renderer's rebuild loop watches, so this forced a full terrain +
// water-surface rebuild almost continuously, visible as the sea's wave/
// lighting animation restarting over and over with no player action.
describe("client gateway sync tiles revision regression", () => {
  it("does not bump tilesRevision for an economy-only delta (yield/upkeep/history), but does for a visually-relevant one", () => {
    const deps = createDeps();
    deps.state.tiles.set("5,5", {
      x: 5,
      y: 5,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      fogged: false
    });
    const revisionBefore = deps.state.tilesRevision;

    applyGatewayTileDeltaBatch(deps, [
      {
        x: 5,
        y: 5,
        ownerId: "me",
        ownershipState: "SETTLED",
        history: [{ event: "tick", at: Date.now() }]
      } as any
    ]);

    expect(deps.state.tilesRevision).toBe(revisionBefore);

    applyGatewayTileDeltaBatch(deps, [
      { x: 5, y: 5, ownerId: "rival", ownershipState: "SETTLED" }
    ]);

    expect(deps.state.tilesRevision).toBeGreaterThan(revisionBefore);
  });
});
