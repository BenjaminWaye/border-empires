import { describe, expect, it } from "vitest";

import { ExploredTilesStore, exploredTilesStats } from "./explored-tiles-store.js";

describe("ExploredTilesStore", () => {
  it("marks tile keys per player and ignores malformed or off-world keys", () => {
    const store = new ExploredTilesStore(20, 10);
    store.markKey("p1", "3,4");
    store.markKey("p1", "19,9");
    store.markKey("p1", "20,0");
    store.markKey("p1", "x,1");
    store.markKey("p1", "5,");
    expect(store.isExplored("p1", 3, 4)).toBe(true);
    expect(store.isExplored("p1", 19, 9)).toBe(true);
    expect(store.isExplored("p2", 3, 4)).toBe(false);
    expect(store.isExplored("p1", 5, 0)).toBe(false);
  });

  it("round-trips through a snapshot and unions with live marks made before restore", () => {
    const before = new ExploredTilesStore(20, 10);
    before.mark("p1", 1, 1);
    before.mark("p1", 2, 1);
    before.mark("p2", 7, 8);
    const snapshot = before.exportSnapshot();

    const after = new ExploredTilesStore(20, 10);
    after.mark("p1", 15, 5); // e.g. coverage seeding during boot, before the snapshot is restored
    after.restore(snapshot);
    expect(after.isExplored("p1", 1, 1)).toBe(true);
    expect(after.isExplored("p1", 2, 1)).toBe(true);
    expect(after.isExplored("p1", 15, 5)).toBe(true);
    expect(after.isExplored("p2", 7, 8)).toBe(true);
  });

  it("drops a snapshot written for another world size", () => {
    const other = new ExploredTilesStore(30, 10);
    other.mark("p1", 1, 1);
    const store = new ExploredTilesStore(20, 10);
    store.restore(other.exportSnapshot());
    expect(store.encodedFor("p1")).toBeUndefined();
  });

  it("retains only current players and reports its size", () => {
    const store = new ExploredTilesStore(20, 10);
    store.mark("p1", 1, 1);
    store.mark("gone", 1, 1);
    store.retainOnly((id) => id === "p1");
    const snapshot = store.exportSnapshot();
    expect(snapshot.map((entry) => entry.playerId)).toEqual(["p1"]);
    expect(exploredTilesStats(snapshot)).toEqual({ players: 1, runNumbers: 2 });
  });

  it("ignores a malformed persisted field instead of throwing", () => {
    const store = new ExploredTilesStore(20, 10);
    for (const bad of [{ playerId: "p1" }, "oops", 42, [null, "x", { playerId: 5 }, { playerId: "p1", width: 20, height: 10, runs: "nope" }]]) {
      expect(() => store.restore(bad as never)).not.toThrow();
    }
    expect(store.encodedFor("p1")).toBeUndefined();
  });
});

describe("ExploredTilesStore.exploredCount", () => {
  it("counts each tile once, survives restore and forgets removed players", () => {
    const store = new ExploredTilesStore(8, 8);
    store.mark("p1", 1, 1);
    store.mark("p1", 1, 1);
    store.markKey("p1", "2,3");
    expect(store.exploredCount("p1")).toBe(2);
    const restored = new ExploredTilesStore(8, 8);
    restored.restore(store.exportSnapshot());
    expect(restored.exploredCount("p1")).toBe(2);
    restored.retainOnly(() => false);
    expect(restored.exploredCount("p1")).toBe(0);
  });
});
