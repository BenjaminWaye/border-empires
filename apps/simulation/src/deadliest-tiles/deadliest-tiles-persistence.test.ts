import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

import { persistDeadliestTiles, restoreDeadliestTiles } from "./deadliest-tiles-persistence.js";
import { InMemorySeasonSummaryStore, type SeasonSummaryStore } from "../season-summary-store.js";
import { SqliteSeasonSummaryStore } from "../sqlite-season-summary-store.js";
import { findMostDeadlyTile } from "../season-stats/season-stats.js";

// Vitest's bundler can't resolve `node:sqlite` at static analysis time
// (Node 22+ builtin), so we pull DatabaseSync via createRequire -- runs
// in the same process but bypasses Vite's module graph.
type DatabaseSyncCtor = new (path: string) => { exec(sql: string): void };
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: DatabaseSyncCtor;
};

// Run the same contract against both implementations: the in-memory store
// backs tests and local runs, but prod runs the SQLite one, and a divergence
// between them would only ever surface as data loss on a real deploy.
const stores: Array<{ name: string; create: () => Promise<SeasonSummaryStore> }> = [
  {
    name: "InMemorySeasonSummaryStore",
    create: async () => new InMemorySeasonSummaryStore()
  },
  {
    name: "SqliteSeasonSummaryStore",
    create: async () => {
      const db = new DatabaseSync(":memory:") as ConstructorParameters<typeof SqliteSeasonSummaryStore>[0];
      const store = new SqliteSeasonSummaryStore(db);
      await store.applySchema();
      return store;
    }
  }
];

describe.each(stores)("deadliest tiles persistence ($name)", ({ create }) => {
  it("survives a process restart — the season stat is unchanged", async () => {
    const store = await create();
    const beforeRestart = new Map<string, number>([
      ["10,20", 50],
      ["30,40", 900],
      ["1,2", 300]
    ]);
    await persistDeadliestTiles(store, "season-1", beforeRestart);

    // A restart: brand-new SimulationRuntime, so a brand-new empty map.
    const afterRestart = new Map<string, number>();
    await restoreDeadliestTiles(store, "season-1", afterRestart);

    expect(findMostDeadlyTile(afterRestart)).toEqual({ x: 30, y: 40, manpowerLost: 900 });
  });

  it("keeps accumulating after a restart rather than starting from zero", async () => {
    const store = await create();
    await persistDeadliestTiles(store, "season-1", new Map([["5,5", 400]]));

    const afterRestart = new Map<string, number>();
    await restoreDeadliestTiles(store, "season-1", afterRestart);
    // Post-restart combat on the same tile adds to the restored total.
    afterRestart.set("5,5", (afterRestart.get("5,5") ?? 0) + 250);

    expect(findMostDeadlyTile(afterRestart)).toEqual({ x: 5, y: 5, manpowerLost: 650 });
  });

  it("is season-scoped — a rollover does not inherit the previous season's totals", async () => {
    const store = await create();
    await persistDeadliestTiles(store, "season-1", new Map([["30,40", 900]]));

    const nextSeason = new Map<string, number>();
    await restoreDeadliestTiles(store, "season-2", nextSeason);

    expect(nextSeason.size).toBe(0);
    expect(findMostDeadlyTile(nextSeason)).toBeUndefined();
  });

  // The ordering invariant the boot path depends on: restoring is what makes
  // the subsequent forced persist safe. If a restart persisted its empty map
  // first, the stored history would be destroyed — guard that explicitly.
  it("an empty map never overwrites stored history", async () => {
    const store = await create();
    await persistDeadliestTiles(store, "season-1", new Map([["30,40", 900]]));

    await persistDeadliestTiles(store, "season-1", new Map());

    const restored = new Map<string, number>();
    await restoreDeadliestTiles(store, "season-1", restored);
    expect(findMostDeadlyTile(restored)).toEqual({ x: 30, y: 40, manpowerLost: 900 });
  });

  it("re-persisting replaces the stored set rather than accumulating rows", async () => {
    const store = await create();

    await persistDeadliestTiles(store, "season-1", new Map([["1,1", 10]]));
    await persistDeadliestTiles(store, "season-1", new Map([["1,1", 10], ["2,2", 20]]));

    const restored = new Map<string, number>();
    await restoreDeadliestTiles(store, "season-1", restored);
    expect(restored.size).toBe(2);
    expect(findMostDeadlyTile(restored)).toEqual({ x: 2, y: 2, manpowerLost: 20 });
  });

  it("restoring a season with nothing stored leaves the map untouched", async () => {
    const store = await create();
    const map = new Map<string, number>([["1,1", 10]]);

    await restoreDeadliestTiles(store, "season-never-persisted", map);

    expect(map.get("1,1")).toBe(10);
    expect(map.size).toBe(1);
  });

  it("round-trips the 24h activity logs", async () => {
    const store = await create();
    const logs = {
      flips: [{ tileId: "1,2", x: 1, y: 2, fromOwner: "p2", toOwner: "p1", at: 1_000 }],
      combat: [{ attackerId: "p1", defenderId: "p2", attackerWon: true, manpowerLoss: 40, x: 1, y: 2, at: 1_000 }]
    };

    await store.saveActivityLogs("season-1", logs);

    await expect(store.loadActivityLogs("season-1")).resolves.toEqual(logs);
  });

  it("keeps activity logs season-scoped and upserts rather than accumulating", async () => {
    const store = await create();
    const first = { flips: [{ tileId: "1,2", x: 1, y: 2, fromOwner: undefined, toOwner: "p1", at: 1_000 }], combat: [] };
    const second = { flips: [], combat: [] };

    await store.saveActivityLogs("season-1", first);
    await store.saveActivityLogs("season-1", second);

    await expect(store.loadActivityLogs("season-1")).resolves.toEqual(second);
    await expect(store.loadActivityLogs("season-2")).resolves.toBeUndefined();
  });
});
