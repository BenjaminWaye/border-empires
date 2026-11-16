import { createRelicState } from "@border-empires/shared";
import type { DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { describe, expect, it, vi } from "vitest";

import { alignLandmarkSuperTiles, createLandmarkSuperTileSync, footprintHeldByRival, superTileActionTarget } from "./landmark-super-tile.js";
import { SimulationRuntime } from "../runtime/runtime.js";
import { buildPlayer, collectEvents } from "../runtime/runtime.test-helpers.js";

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

  /** A runtime-shaped writer: every write goes through sync.write, and `hook` runs inside the write like Runtime.replaceTileState's hooks. */
  const syncedWorld = (tiles: Map<string, DomainTileState>, hook?: (key: string, tile: DomainTileState) => void) => {
    const events: SimulationEvent[] = [];
    let sync: ReturnType<typeof createLandmarkSuperTileSync> | undefined = undefined;
    const write = (key: string, tile: DomainTileState, commandId: string): void => sync!.write(() => {
      const previous = tiles.get(key); tiles.set(key, tile); hook?.(key, tile); sync!.record(previous, tile, commandId);
    });
    sync = createLandmarkSuperTileSync({ tiles, replaceTileState: write, tileDeltaFromState: tile => ({ x: tile.x, y: tile.y }), emitEvent: event => events.push(event) });
    return { write, events };
  };

  it("mirrors an ownership change on any member to the other eight, once", () => {
    const tiles = footprintWorld(relicAt(10, 10));
    const { write, events } = syncedWorld(tiles);
    write("9,9", land(9, 9, { ownerId: "p2", ownershipState: "FRONTIER" }), "capture-1");
    expect(ownerGrid(tiles, 10, 10, 1)).toEqual(Array(9).fill("p2"));
    expect(tiles.get("10,10")?.ownershipState).toBe("FRONTIER");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ eventType: "TILE_DELTA_BATCH", commandId: "capture-1", playerId: "p2" });
    write("10,10", { ...tiles.get("10,10")!, ownershipState: "SETTLED" }, "settle-1");
    expect([...tiles.values()].filter(tile => tile.ownershipState === "SETTLED")).toHaveLength(9);
  });

  it("lets the centre win when a hook rewrites a member during the centre's own write", () => {
    const tiles = footprintWorld(relicAt(10, 10, { ownerId: "loser", ownershipState: "SETTLED" }));
    alignLandmarkSuperTiles(tiles);
    // Like a reach unsettle fired by the capture: the loser's members drop to FRONTIER mid-write.
    let fired = false;
    const { write } = syncedWorld(tiles, (key, tile) => {
      if (key !== "10,10" || tile.ownerId !== "winner" || fired) return;
      fired = true;
      write("9,9", { ...tiles.get("9,9")!, ownershipState: "FRONTIER" }, "unsettle");
      write("11,11", { ...tiles.get("11,11")!, ownershipState: "FRONTIER" }, "unsettle");
    });
    write("10,10", { ...tiles.get("10,10")!, ownerId: "winner", ownershipState: "FRONTIER", muster: undefined }, "capture-1");
    expect(ownerGrid(tiles, 10, 10, 1)).toEqual(Array(9).fill("winner"));
  });

  it("aligns the footprint when an AFC is built on an already-owned tile and drops a stale muster", () => {
    const tiles = footprintWorld(land(10, 10, { ownerId: "p1", ownershipState: "SETTLED" }));
    tiles.set("9,10", land(9, 10, { ownerId: "p2", ownershipState: "SETTLED", muster: { ownerId: "p2", amount: 5 } as DomainTileState["muster"] }));
    expect(footprintHeldByRival(tiles, 10, 10, "p1")).toBe(true);
    expect(footprintHeldByRival(tiles, 20, 20, "p1")).toBe(false);
    const { write } = syncedWorld(tiles);
    write("10,10", { ...tiles.get("10,10")!, afc: { ownerId: "p1", status: "active" } as DomainTileState["afc"] }, "afc-build");
    expect(ownerGrid(tiles, 10, 10, 1)).toEqual(Array(9).fill("p1"));
    expect(tiles.get("9,10")?.muster).toBeUndefined();
  });

  it("leaves a legacy building in the footprint with its owner", () => {
    const tiles = footprintWorld(relicAt(10, 10, { ownerId: "p1", ownershipState: "SETTLED" }));
    tiles.set("9,10", land(9, 10, { ownerId: "p2", ownershipState: "SETTLED", fort: { status: "active" } as DomainTileState["fort"] }));
    alignLandmarkSuperTiles(tiles);
    expect(tiles.get("9,10")?.ownerId).toBe("p2");
    expect(tiles.get("11,10")?.ownerId).toBe("p1");
  });

  it("garrisons the whole site once when a footprint tile is settled", async () => {
    vi.useFakeTimers();
    try {
      let now = 1_000;
      const runtime = new SimulationRuntime({
        now: () => now,
        initialPlayers: new Map([["player-1", buildPlayer("player-1", { points: 500, manpowerUpdatedAt: 1_000 })]]),
        initialState: { tiles: [...footprintWorld(relicAt(16, 16, { ownerId: "player-1", ownershipState: "FRONTIER" })).values(),
          land(16, 13, { ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT" } })], activeLocks: [] }
      });
      const events = collectEvents(runtime);
      runtime.submitCommand({ commandId: "settle-a", sessionId: "s", playerId: "player-1", clientSeq: 1, issuedAt: now, type: "SETTLE", payloadJson: JSON.stringify({ x: 15, y: 15 }) });
      await Promise.resolve();
      runtime.submitCommand({ commandId: "settle-b", sessionId: "s", playerId: "player-1", clientSeq: 2, issuedAt: now, type: "SETTLE", payloadJson: JSON.stringify({ x: 16, y: 15 }) });
      await Promise.resolve();
      const started = events.filter(event => event.eventType === "SETTLEMENT_STARTED");
      expect(started).toHaveLength(1);
      expect(started[0]).toMatchObject({ tileKey: "16,16" });
      expect(runtime.exportState().pendingSettlements).toHaveLength(1);
      const resolvesAt = (started[0] as { resolvesAt: number }).resolvesAt;
      now = resolvesAt;
      vi.advanceTimersByTime(resolvesAt - 1_000);
      await Promise.resolve();
      const settled = runtime.exportState().tiles.filter(tile => tile.ownerId === "player-1" && tile.ownershipState === "SETTLED" && Math.abs(tile.x - 16) <= 1 && Math.abs(tile.y - 16) <= 1);
      expect(settled).toHaveLength(9);
    } finally {
      vi.useRealTimers();
    }
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
