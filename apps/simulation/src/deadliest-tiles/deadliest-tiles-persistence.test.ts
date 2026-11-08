import { recordSeasonTileLoss } from "./season-tile-player-losses.js";
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
  it("preserves each player's full-season losses across restarts and repeated restores", async () => {
    const store = await create();
    const totals = new Map<string, number>();
    recordSeasonTileLoss(totals, "10,20", "p1", 200);
    recordSeasonTileLoss(totals, "10,20", "p2", 300);
    recordSeasonTileLoss(totals, "10,20", "p1", 250);
    await persistDeadliestTiles(store, "season-1", totals);
    const restored = new Map<string, number>();
    await restoreDeadliestTiles(store, "season-1", restored);
    await restoreDeadliestTiles(store, "season-1", restored);
    expect(findMostDeadlyTile(restored, [{ id: "p1", name: "Waypoint" }])).toEqual({
      x: 10, y: 20, manpowerLost: 750,
      mostLossesPlayer: { playerId: "p1", playerName: "Waypoint", manpowerLost: 450 }
    });
    recordSeasonTileLoss(restored, "10,20", "p2", 200);
    expect(findMostDeadlyTile(restored)?.mostLossesPlayer).toMatchObject({ playerId: "p2", manpowerLost: 500 });
    const loaded = (await store.loadDeadliestTiles("season-1"))!;
    loaded[0]!.playerLosses![0]!.manpowerLost = 99999;
    expect((await store.loadDeadliestTiles("season-1"))![0]!.playerLosses![0]!.manpowerLost).toBe(450);
  });

  it("does not crown a new player from a tile omitted at restart, including after another save", async () => {
    const store = await create();
    const before = new Map<string, number>();
    for (let i = 0; i < 200; i++) recordSeasonTileLoss(before, `${i},0`, "retained", 5000);
    recordSeasonTileLoss(before, "500,1", "original-leader", 4000);
    await persistDeadliestTiles(store, "season-1", before);
    const restarted = new Map<string, number>();
    await restoreDeadliestTiles(store, "season-1", restarted);
    recordSeasonTileLoss(restarted, "500,1", "p2", 3000);
    recordSeasonTileLoss(restarted, "500,1", "p3", 2500);
    expect(findMostDeadlyTile(restarted)).toEqual({ x: 500, y: 1, manpowerLost: 5500 });
    await persistDeadliestTiles(store, "season-1", restarted);
    const again = new Map<string, number>();
    await restoreDeadliestTiles(store, "season-1", again);
    recordSeasonTileLoss(again, "500,1", "p2", 100);
    expect(findMostDeadlyTile(again)?.mostLossesPlayer).toBeUndefined();
    // Kept tiles retain their complete player histories.
    recordSeasonTileLoss(again, "0,0", "retained", 1000);
    expect(findMostDeadlyTile(again)?.mostLossesPlayer?.playerId).toBe("retained");
  });

  it("does not assume a legacy full top-K save has complete history", async () => {
    const store = await create();
    await store.saveDeadliestTiles("season-1", Array.from({ length: 200 }, (_, x) => ({
      x, y: 0, manpowerLost: 5000, playerLosses: [{ playerId: "recent-only", manpowerLost: 5000 }]
    })));
    const totals = new Map<string, number>();
    await restoreDeadliestTiles(store, "season-1", totals);
    expect(findMostDeadlyTile(totals)?.mostLossesPlayer).toBeUndefined();
  });

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
      combat: [{ attackerId: "p1", defenderId: "p2", attackerWon: true, manpowerLoss: 40, x: 1, y: 2, at: 1_000 }],
      personalImpacts: []
    };

    await store.saveActivityLogs("season-1", logs);

    await expect(store.loadActivityLogs("season-1")).resolves.toEqual(logs);
  });

  it("keeps activity logs season-scoped and upserts rather than accumulating", async () => {
    const store = await create();
    const first = { flips: [{ tileId: "1,2", x: 1, y: 2, fromOwner: undefined, toOwner: "p1", at: 1_000 }], combat: [], personalImpacts: [] };
    const second = { flips: [], combat: [], personalImpacts: [] };

    await store.saveActivityLogs("season-1", first);
    await store.saveActivityLogs("season-1", second);

    await expect(store.loadActivityLogs("season-1")).resolves.toEqual(second);
    await expect(store.loadActivityLogs("season-2")).resolves.toBeUndefined();
  });
});
