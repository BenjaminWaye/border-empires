import type { DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { describe, expect, it } from "vitest";

import { applyEncirclement, type RuntimeEncirclementApplicationContext } from "./runtime-encirclement-application.js";
import type { SimulationTileWireDelta } from "./runtime-types.js";

const harness = (tiles: Map<string, DomainTileState>) => {
  const events: SimulationEvent[] = [];
  const context: RuntimeEncirclementApplicationContext = {
    tiles,
    now: () => 1_000,
    activeAetherBridgesForPlayer: () => [],
    seaLaneNeighborKeysByTileKey: new Map(),
    replaceTileState: (tileKey, tile) => {
      tiles.set(tileKey, tile);
    },
    tileDeltaFromState: (tile) => ({ x: tile.x, y: tile.y }) as SimulationTileWireDelta,
    emitEvent: (event) => {
      events.push(event);
    },
    runtimeLogInfo: () => {},
    registerFrontierAutoHeal: () => {}
  };
  return { context, events };
};

describe("applyEncirclement — cut-off clearing", () => {
  it("clears ownership on a cut-off frontier tile but preserves its naturalWonder", () => {
    const wonder = { type: "CARTOGRAPHERS_LENS" } as DomainTileState["naturalWonder"];
    const tiles = new Map<string, DomainTileState>([
      [
        "12,10",
        {
          x: 12,
          y: 10,
          terrain: "LAND",
          ownerId: "player-1",
          ownershipState: "FRONTIER",
          naturalWonder: wonder
        } as DomainTileState
      ]
      // no settled tile for player-1 anywhere -- "12,10" is cut off
    ]);
    const { context } = harness(tiles);

    applyEncirclement(context, ["12,10"], "player-1", "cmd-1");

    const tile = tiles.get("12,10");
    expect(tile?.ownerId).toBeUndefined();
    expect(tile?.ownershipState).toBeUndefined();
    expect(tile?.naturalWonder).toBe(wonder); // world-gen feature, not owner-scoped -- survives being cut off
  });

  it("keeps a captured building standing on a cut-off frontier tile so the next claimer inherits it", () => {
    // A freshly captured MANUFACTORY sits on FRONTIER while its capture
    // auto-settle runs. Being cut off releases the territory, not the
    // building: reach heals the tile back and the settle lands on it intact.
    const tiles = new Map<string, DomainTileState>([
      [
        "12,10",
        {
          x: 12,
          y: 10,
          terrain: "LAND",
          ownerId: "player-1",
          ownershipState: "FRONTIER",
          economicStructure: { type: "MANUFACTORY", ownerId: "player-1", status: "active", activatedAt: 500 },
          fort: { ownerId: "player-1", status: "active", activatedAt: 500 },
          observatory: { ownerId: "player-1", status: "active", activatedAt: 500 }
        } as DomainTileState
      ]
    ]);
    const { context } = harness(tiles);

    applyEncirclement(context, ["12,10"], "player-1", "cmd-1");

    const tile = tiles.get("12,10");
    expect(tile?.ownerId).toBeUndefined();
    expect(tile?.economicStructure).toMatchObject({ type: "MANUFACTORY", status: "active" });
    expect(tile?.fort).toMatchObject({ status: "active" });
    expect(tile?.observatory).toMatchObject({ status: "active" });
  });

  it("still razes siege batteries, relay beacons and half-built structures when cut off", () => {
    const tiles = new Map<string, DomainTileState>([
      [
        "12,10",
        {
          x: 12,
          y: 10,
          terrain: "LAND",
          ownerId: "player-1",
          ownershipState: "FRONTIER",
          economicStructure: { type: "RELAY_BEACON", ownerId: "player-1", status: "active", activatedAt: 500 },
          observatory: { ownerId: "player-1", status: "under_construction", activatedAt: 500 },
          siegeBattery: { ownerId: "player-1", status: "active" }
        } as DomainTileState
      ]
    ]);
    const { context } = harness(tiles);

    applyEncirclement(context, ["12,10"], "player-1", "cmd-1");

    const tile = tiles.get("12,10");
    expect(tile?.economicStructure).toBeUndefined();
    expect(tile?.observatory).toBeUndefined();
    expect(tile?.siegeBattery).toBeUndefined();
  });
});
