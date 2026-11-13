import { createRelicState } from "@border-empires/shared";
import type { DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { describe, expect, it } from "vitest";

import { alignLandmarkSuperTiles, createLandmarkSuperTileSync, superTileActionTarget } from "./landmark-super-tile.js";
import { SimulationRuntime } from "../runtime/runtime.js";
import { buildPlayer } from "../runtime/runtime.test-helpers.js";

const land = (x: number, y: number, extra: Partial<DomainTileState> = {}): DomainTileState => ({ x, y, terrain: "LAND", ...extra });
const relicAt = (x: number, y: number, extra: Partial<DomainTileState> = {}): DomainTileState =>
  land(x, y, { naturalWonder: createRelicState("WARPRESS"), ...extra });

const footprintWorld = (centre: DomainTileState): Map<string, DomainTileState> => {
  const tiles = new Map<string, DomainTileState>();
  for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) tiles.set(`${centre.x + dx},${centre.y + dy}`, land(centre.x + dx, centre.y + dy));
  tiles.set(`${centre.x},${centre.y}`, centre);
  return tiles;
};

const ownerGrid = (tiles: Map<string, DomainTileState>, cx: number, cy: number, radius: number): Array<string | undefined> => {
  const owners: Array<string | undefined> = [];
  for (let dy = -radius; dy <= radius; dy += 1) for (let dx = -radius; dx <= radius; dx += 1) owners.push(tiles.get(`${cx + dx},${cy + dy}`)?.ownerId);
  return owners;
};

describe("AFC/relic super tile", () => {
  it("targets the centre when any of the nine tiles is aimed at", () => {
    const tiles = footprintWorld(relicAt(10, 10));
    expect(superTileActionTarget(tiles, tiles.get("9,11")!)).toBe(tiles.get("10,10"));
    expect(superTileActionTarget(tiles, tiles.get("10,10")!)).toBe(tiles.get("10,10"));
    expect(superTileActionTarget(tiles, tiles.get("8,10")!)).toBe(tiles.get("8,10"));
  });

  it("leaves towns, docks and mountains in an old footprint out of the super tile", () => {
    const tiles = footprintWorld(relicAt(10, 10, { ownerId: "p1", ownershipState: "SETTLED" }));
    tiles.set("9,9", land(9, 9, { town: { type: "MARKET", populationTier: "TOWN" } }));
    tiles.set("11,9", { ...land(11, 9), terrain: "MOUNTAIN" });
    expect(superTileActionTarget(tiles, tiles.get("9,9")!)).toBe(tiles.get("9,9"));
    alignLandmarkSuperTiles(tiles);
    expect(tiles.get("9,9")?.ownerId).toBeUndefined();
    expect(tiles.get("11,9")?.ownerId).toBeUndefined();
    expect(tiles.get("10,9")?.ownerId).toBe("p1");
  });

  it("aligns every footprint tile with the centre at boot", () => {
    const tiles = footprintWorld(relicAt(10, 10, { ownerId: "p1", ownershipState: "SETTLED" }));
    tiles.set("11,11", land(11, 11, { ownerId: "p2", ownershipState: "FRONTIER", frontierDecayAt: 99 }));
    expect(alignLandmarkSuperTiles(tiles)).toBe(8);
    expect(ownerGrid(tiles, 10, 10, 1)).toEqual(Array(9).fill("p1"));
    expect(tiles.get("11,11")).toMatchObject({ ownershipState: "SETTLED" });
    expect(tiles.get("11,11")?.frontierDecayAt).toBeUndefined();
    expect(tiles.get("12,12")?.ownerId).toBeUndefined();
  });

  it("mirrors an ownership change on any member to the other eight, once", () => {
    const tiles = footprintWorld(relicAt(10, 10));
    const events: SimulationEvent[] = [];
    let sync: ReturnType<typeof createLandmarkSuperTileSync> | undefined = undefined;
    const write = (key: string, tile: DomainTileState, commandId: string): void => {
      const previous = tiles.get(key); tiles.set(key, tile); sync?.(previous, tile, commandId);
    };
    sync = createLandmarkSuperTileSync({ tiles, replaceTileState: write, tileDeltaFromState: tile => ({ x: tile.x, y: tile.y }), emitEvent: event => events.push(event) });
    write("9,9", land(9, 9, { ownerId: "p2", ownershipState: "FRONTIER" }), "capture-1");
    expect(ownerGrid(tiles, 10, 10, 1)).toEqual(Array(9).fill("p2"));
    expect(tiles.get("10,10")?.ownershipState).toBe("FRONTIER");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ eventType: "TILE_DELTA_BATCH", commandId: "capture-1", playerId: "p2" });
    write("10,10", { ...tiles.get("10,10")!, ownershipState: "SETTLED" }, "settle-1");
    expect([...tiles.values()].filter(tile => tile.ownershipState === "SETTLED")).toHaveLength(9);
  });

  it("gives the relic owner all nine tiles when the runtime loads a world", () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", buildPlayer("player-1")]]),
      initialState: { tiles: [...footprintWorld(relicAt(16, 16, { ownerId: "player-1", ownershipState: "SETTLED" })).values()], activeLocks: [] }
    });
    const owned = runtime.exportState().tiles.filter(tile => tile.ownerId === "player-1" && Math.abs(tile.x - 16) <= 2 && Math.abs(tile.y - 16) <= 2).map(tile => `${tile.x},${tile.y}`).sort();
    expect(owned).toEqual(["15,15", "15,16", "15,17", "16,15", "16,16", "16,17", "17,15", "17,16", "17,17"]);
  });
});
