import { describe, expect, it } from "vitest";

import { SimulationRuntime } from "./runtime/runtime.js";

// Regression: visibleTileProjection (backing SubscribePlayer, i.e. every
// login and every reconnect, plus the post-season full-visibility export)
// never included watchtowerJson/waystationJson at all -- unlike every
// sibling overlay field (shardSiteJson, naturalWonderJson, fortJson, etc.),
// which are all truthy-guarded but present. Watchtower/Waystation sites
// therefore never reached the client via this path: a dormant site tile
// that had never been touched by a live TILE_DELTA_BATCH was invisible to a
// freshly-logged-in or reconnecting client even though the sim held it in
// memory (this is the same bug class already fixed for musterJson in
// runtime-visible-state-muster-snapshot.test.ts).
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

describe("SimulationRuntime exportVisibleStateForPlayer — watchtower/waystation snapshot parity", () => {
  it("includes watchtowerJson for a tile with a dormant watchtower site", () => {
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
            watchtower: { activated: false }
          }
        ],
        activeLocks: []
      }
    });

    const exported = runtime.exportVisibleStateForPlayer("player-1");
    const tile = exported.tiles.find((entry) => entry.x === 5 && entry.y === 5);

    expect(tile?.watchtowerJson).toBe(JSON.stringify({ activated: false }));
  });

  it("includes waystationJson for a tile with a dormant waystation site", () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", makePlayer("player-1")]]),
      initialState: {
        tiles: [
          {
            x: 6,
            y: 6,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            waystation: { activated: false }
          }
        ],
        activeLocks: []
      }
    });

    const exported = runtime.exportVisibleStateForPlayer("player-1");
    const tile = exported.tiles.find((entry) => entry.x === 6 && entry.y === 6);

    expect(tile?.waystationJson).toBe(JSON.stringify({ activated: false }));
  });

  it("omits watchtowerJson/waystationJson for a tile with neither site (unchanged from before this fix)", () => {
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

    expect(tile && "watchtowerJson" in tile).toBe(false);
    expect(tile && "waystationJson" in tile).toBe(false);
  });
});
