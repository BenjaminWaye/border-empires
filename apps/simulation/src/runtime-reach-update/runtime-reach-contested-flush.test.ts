import { describe, expect, it } from "vitest";
import { createReachContestedDirtyState } from "./runtime-reach-contested-tiles.js";
import { flushContestedTileReachUpdates } from "./runtime-reach-contested-flush.js";

type FakeTile = { x: number; y: number; ownerId?: string | undefined; reachOwnerId?: string | undefined };
type FakeDelta = { x: number; y: number; reachOwnerId?: string | undefined };

describe("flushContestedTileReachUpdates", () => {
  it("emits fresh deltas (including reachOwnerId) for every dirty contested tile, then clears the dirty set", () => {
    const state = createReachContestedDirtyState();
    state.dirtyContestedTileKeys.add("10,10");
    state.dirtyContestedTileKeys.add("20,20");

    const tiles = new Map<string, FakeTile>([
      ["10,10", { x: 10, y: 10, ownerId: "player-1", reachOwnerId: "player-2" }],
      ["20,20", { x: 20, y: 20, ownerId: "player-1", reachOwnerId: "player-2" }]
    ]);
    const emitted: Array<{ eventType: "TILE_DELTA_BATCH"; commandId: string; playerId: string; tileDeltas: FakeDelta[] }> = [];

    const emittedTileCount = flushContestedTileReachUpdates(
      state,
      {
        getTile: (key) => tiles.get(key),
        tileDeltaFromState: (tile) => ({ x: tile.x, y: tile.y, reachOwnerId: tile.reachOwnerId }),
        emitEvent: (event) => emitted.push(event)
      },
      "cmd-1"
    );

    expect(emittedTileCount).toBe(2);
    expect(state.dirtyContestedTileKeys.size).toBe(0);
    // Both tiles share the same actual owner ("player-1"), so they batch into one event.
    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.playerId).toBe("player-1");
    expect(emitted[0]?.tileDeltas).toEqual(
      expect.arrayContaining([
        { x: 10, y: 10, reachOwnerId: "player-2" },
        { x: 20, y: 20, reachOwnerId: "player-2" }
      ])
    );
  });

  it("groups deltas by each tile's current actual owner, unowned tiles under the empty-string group", () => {
    const state = createReachContestedDirtyState();
    state.dirtyContestedTileKeys.add("1,1");
    state.dirtyContestedTileKeys.add("2,2");

    const tiles = new Map<string, FakeTile>([
      ["1,1", { x: 1, y: 1, ownerId: "player-1" }],
      ["2,2", { x: 2, y: 2 }] // unowned/neutral
    ]);
    const emitted: Array<{ playerId: string; tileDeltas: FakeDelta[] }> = [];

    flushContestedTileReachUpdates(
      state,
      {
        getTile: (key) => tiles.get(key),
        tileDeltaFromState: (tile) => ({ x: tile.x, y: tile.y }),
        emitEvent: (event) => emitted.push(event)
      },
      "cmd-2"
    );

    expect(emitted).toHaveLength(2);
    const playerIds = emitted.map((e) => e.playerId).sort();
    expect(playerIds).toEqual(["", "player-1"]);
  });

  it("is a no-op when nothing is dirty", () => {
    const state = createReachContestedDirtyState();
    let emitCount = 0;
    const emittedTileCount = flushContestedTileReachUpdates(
      state,
      { getTile: () => undefined, tileDeltaFromState: (t) => t as FakeDelta, emitEvent: () => emitCount++ },
      "cmd-3"
    );
    expect(emittedTileCount).toBe(0);
    expect(emitCount).toBe(0);
  });

  it("skips a dirty key whose tile no longer exists, without throwing", () => {
    const state = createReachContestedDirtyState();
    state.dirtyContestedTileKeys.add("99,99");
    let emitCount = 0;
    const emittedTileCount = flushContestedTileReachUpdates(
      state,
      { getTile: () => undefined, tileDeltaFromState: (t) => t as FakeDelta, emitEvent: () => emitCount++ },
      "cmd-4"
    );
    expect(emittedTileCount).toBe(0);
    expect(emitCount).toBe(0);
    expect(state.dirtyContestedTileKeys.size).toBe(0);
  });
});
