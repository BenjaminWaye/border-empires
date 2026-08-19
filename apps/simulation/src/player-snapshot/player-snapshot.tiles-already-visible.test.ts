import { describe, expect, it } from "vitest";

import { buildPlayerSubscriptionSnapshot } from "./player-snapshot.js";
import { SimulationRuntime } from "../runtime/runtime.js";

// Regression pin for the login fast path: when the runtime state passed to
// buildPlayerSubscriptionSnapshot came from exportVisibleStateForPlayer (fog
// login path), the tile set is already visibility-filtered and sorted, so the
// builder may skip its O(territory × r²) vision expansion. These tests pin
// that the skip flag produces byte-identical tiles to the recompute path — if
// export-side visibility and builder-side visibility ever diverge, this fails.
describe("buildPlayerSubscriptionSnapshot with tilesAlreadyVisible", () => {
  const makeRuntime = () =>
    new SimulationRuntime({
      initialPlayers: new Map([
        [
          "player-1",
          {
            id: "player-1",
            isAi: false,
            name: "Player 1",
            points: 100,
            manpower: 120,
            techIds: new Set<string>(),
            domainIds: new Set<string>(),
            mods: { attack: 1, defense: 1, income: 1, vision: 1 },
            techRootId: "rewrite-local",
            allies: new Set<string>(),
            strategicResources: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 }
          }
        ],
        [
          "player-2",
          {
            id: "player-2",
            isAi: false,
            name: "Player 2",
            points: 100,
            manpower: 120,
            techIds: new Set<string>(),
            domainIds: new Set<string>(),
            mods: { attack: 1, defense: 1, income: 1, vision: 1 },
            techRootId: "rewrite-local",
            allies: new Set<string>(),
            strategicResources: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 }
          }
        ]
      ]),
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND" as const, ownerId: "player-1", ownershipState: "SETTLED" as const },
          { x: 11, y: 10, terrain: "LAND" as const, ownerId: "player-1", ownershipState: "FRONTIER" as const },
          // Neutral tile inside vision radius (dx=1 from the SETTLED tile).
          { x: 9, y: 10, terrain: "LAND" as const },
          // Neutral tile just beyond the FRONTIER tile (dx=2 from the SETTLED
          // tile, dx=1 from the FRONTIER tile) — a FRONTIER claim holds a
          // flat FRONTIER_STANDING_VISION_RADIUS (1) of its own, so this
          // tile IS visible despite being one tile past the SETTLED radius.
          { x: 12, y: 10, terrain: "LAND" as const },
          // Enemy territory far outside vision — must stay hidden on both paths.
          { x: 60, y: 60, terrain: "LAND" as const, ownerId: "player-2", ownershipState: "SETTLED" as const },
          { x: 61, y: 60, terrain: "LAND" as const, ownerId: "player-2", ownershipState: "SETTLED" as const }
        ],
        activeLocks: []
      }
    });

  it("produces identical tiles to the vision-recompute path when fed a visible-state export", () => {
    const runtime = makeRuntime();
    const visibleState = runtime.exportVisibleStateForPlayer("player-1");

    const recomputed = buildPlayerSubscriptionSnapshot("player-1", visibleState);
    const skipped = buildPlayerSubscriptionSnapshot("player-1", visibleState, undefined, {
      tilesAlreadyVisible: true
    });

    expect(skipped.tiles.length).toBeGreaterThan(0);
    expect(skipped.tiles).toEqual(recomputed.tiles);
  });

  it("keeps out-of-vision enemy territory hidden on both paths", () => {
    const runtime = makeRuntime();
    const visibleState = runtime.exportVisibleStateForPlayer("player-1");

    const recomputed = buildPlayerSubscriptionSnapshot("player-1", visibleState);
    const skipped = buildPlayerSubscriptionSnapshot("player-1", visibleState, undefined, {
      tilesAlreadyVisible: true
    });

    for (const snapshot of [recomputed, skipped]) {
      expect(snapshot.tiles.some((tile) => tile.x === 60 && tile.y === 60)).toBe(false);
      expect(snapshot.tiles.some((tile) => tile.x === 61 && tile.y === 60)).toBe(false);
      expect(snapshot.tiles.some((tile) => tile.x === 10 && tile.y === 10)).toBe(true);
      expect(snapshot.tiles.some((tile) => tile.x === 9 && tile.y === 10)).toBe(true);
      // (12,10) is dx=1 from the FRONTIER tile at (11,10) -- covered by its
      // flat FRONTIER_STANDING_VISION_RADIUS.
      expect(snapshot.tiles.some((tile) => tile.x === 12 && tile.y === 10)).toBe(true);
    }
  });

  it("does not re-filter or re-sort the provided tiles when the flag is set", () => {
    const runtime = makeRuntime();
    const visibleState = runtime.exportVisibleStateForPlayer("player-1");

    const skipped = buildPlayerSubscriptionSnapshot("player-1", visibleState, undefined, {
      tilesAlreadyVisible: true
    });

    // Export already sorts by (x, y); the skip path must preserve that count
    // and ordering exactly (same tiles, same order as the source export).
    expect(skipped.tiles.map((tile) => `${tile.x},${tile.y}`)).toEqual(
      visibleState.tiles.map((tile) => `${tile.x},${tile.y}`)
    );
  });
});
