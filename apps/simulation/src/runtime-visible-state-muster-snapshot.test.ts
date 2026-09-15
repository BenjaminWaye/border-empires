import { describe, expect, it } from "vitest";

import { SimulationRuntime } from "./runtime/runtime.js";

// Regression: visibleTileProjection (backing SubscribePlayer, i.e. every
// login and every reconnect) never included musterJson at all -- unlike
// every sibling overlay field (fortJson, sabotageJson, siegeOutpostJson,
// etc.), which are all truthy-guarded but present. A currently-active
// muster flag (HOLD/ADVANCE/MARCH) therefore never reached the client via
// this path: it only ever became visible through a later live
// TILE_DELTA_BATCH from tickMuster, which a client that just logged in or
// reconnected hasn't received yet -- and never will for a flag already at
// its cap, since tickMuster deliberately skips emitting a delta when there
// is no inflow to report. The tile menu and the manpower panel's "Active
// muster flags" list both read purely off the client's local tile cache
// (state.tiles), so this made a real, already-staged flag invisible after
// every reload/reconnect until the player happened to click that exact
// tile.
const makePlayer = (id: string) => ({
  id,
  isAi: false,
  points: 0,
  manpower: 100,
  techIds: new Set<string>(),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-local",
  allies: new Set<string>()
});

describe("SimulationRuntime exportVisibleStateForPlayer — muster snapshot parity", () => {
  it("includes musterJson for a tile with an active muster flag", () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", makePlayer("player-1")]]),
      initialState: {
        tiles: [
          {
            x: 5,
            y: 5,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            muster: { ownerId: "player-1", amount: 12, mode: "HOLD", updatedAt: 1_000 }
          }
        ],
        activeLocks: []
      }
    });

    const exported = runtime.exportVisibleStateForPlayer("player-1");
    const tile = exported.tiles.find((entry) => entry.x === 5 && entry.y === 5);

    expect(tile?.musterJson).toBe(JSON.stringify({ ownerId: "player-1", amount: 12, mode: "HOLD", updatedAt: 1_000 }));
  });

  it("omits musterJson for a tile with no muster flag (unchanged from before this fix)", () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", makePlayer("player-1")]]),
      initialState: {
        tiles: [{ x: 5, y: 5, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }],
        activeLocks: []
      }
    });

    const exported = runtime.exportVisibleStateForPlayer("player-1");
    const tile = exported.tiles.find((entry) => entry.x === 5 && entry.y === 5);

    expect(tile && "musterJson" in tile).toBe(false);
  });
});
