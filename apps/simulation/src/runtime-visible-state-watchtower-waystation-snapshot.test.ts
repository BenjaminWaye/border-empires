import { describe, expect, it } from "vitest";

import { SimulationRuntime } from "./runtime/runtime.js";

// Regression: visibleTileProjection (backing SubscribePlayer, i.e. every
// login and every reconnect, plus the post-season full-visibility export)
// never included watchtowerJson/waystationJson at all -- unlike every
// sibling overlay field (naturalWonderJson, fortJson, etc.),
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

  it("keeps a captured waystation's hidden resource reward private across tile projections", () => {
    const claimant = "player-1";
    const observer = "player-2";
    const viewer = makePlayer(observer);
    const waystation = {
      activated: true, activatedByPlayerId: claimant, grantedEffect: "RESOURCE_TILE" as const, grantedResource: "TITANIUM" as const
    };
    const coords = { x: 6, y: 6 };
    const tile = { ...coords, terrain: "LAND" as const, ownerId: claimant, ownershipState: "SETTLED" as const, resource: "TITANIUM" as const, waystation };
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([[claimant, makePlayer(claimant)], [observer, viewer]]),
      initialState: {
        tiles: [tile, { x: 6, y: 7, terrain: "LAND", ownerId: observer, ownershipState: "SETTLED" }],
        activeLocks: []
      }
    });

    const live = { ...coords, resource: tile.resource, ownerId: claimant, waystationJson: JSON.stringify(waystation) };
    const observedDeltas = [
      runtime.filterTileDeltasForPlayer([live], observer)[0],
      runtime.filterTileDeltasForPlayer([{ ...live, forceVisibleForPlayerId: observer }], observer)[0],
      runtime.wireDeltaForTileKey("6,6", observer),
      runtime.exportVisibleStateForPlayer(observer).tiles.find((entry) => entry.x === 6 && entry.y === 6),
      runtime.exportTilesInAreaForPlayer(observer, 6, 6, 0).find((entry) => entry.x === 6 && entry.y === 6)
    ];
    for (const delta of observedDeltas) {
      expect(delta).toMatchObject(coords);
      expect(delta?.resource).toBeUndefined();
      expect(delta?.waystationJson).toBeUndefined();
    }
    expect(runtime.filterTileDeltasForPlayer([live], observer)[0]).toHaveProperty("waystationJson", undefined);
    expect(runtime.filterTileDeltasForPlayer([live], claimant)[0]?.waystationJson).toBe(live.waystationJson);
    expect(runtime.wireDeltaForTileKey("6,6", claimant)?.waystationJson).toBe(live.waystationJson);
    const fullMapTile = runtime.exportState().tiles.find((entry) => entry.x === 6 && entry.y === 6);
    expect(fullMapTile?.resource).toBe("TITANIUM");
    expect(fullMapTile?.waystationJson).toBeUndefined();
    const checkpointTile = runtime.exportSnapshotSections().initialState.tiles.find((entry) => entry.x === 6 && entry.y === 6);
    expect(checkpointTile?.waystation).toEqual(waystation);
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

// Regression: visibleTileProjection (SubscribePlayer -- every login and
// reconnect) never included prospectSignature, the worldgen clue marking
// land near a strategic-resource cluster. The only path that carried it was
// the full tile delta, which fires when a tile *changes* -- and unclaimed
// clue tiles almost never change -- so players never saw the clues and the
// client could not tell whether Titanium was likely nearby.
const makeProspectPlayer = (id: string) => ({
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

describe("SimulationRuntime exportVisibleStateForPlayer — prospect clue snapshot parity", () => {
  it("includes prospectSignature for a visible clue tile", () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", makeProspectPlayer("player-1")]]),
      initialState: {
        tiles: [
          { x: 5, y: 5, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 6, y: 5, terrain: "LAND", prospectSignature: "FERROUS_DUST" }
        ],
        activeLocks: []
      }
    });

    const exported = runtime.exportVisibleStateForPlayer("player-1");
    const tile = exported.tiles.find((entry) => entry.x === 6 && entry.y === 5);

    expect(tile?.prospectSignature).toBe("FERROUS_DUST");
  });

  it("omits prospectSignature for a tile with no clue", () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", makeProspectPlayer("player-1")]]),
      initialState: {
        tiles: [{ x: 5, y: 5, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }],
        activeLocks: []
      }
    });

    const exported = runtime.exportVisibleStateForPlayer("player-1");
    const tile = exported.tiles.find((entry) => entry.x === 5 && entry.y === 5);

    expect(tile).toBeDefined();
    expect(tile && "prospectSignature" in tile).toBe(false);
  });
});
