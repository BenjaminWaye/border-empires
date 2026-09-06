import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

import { InMemorySeasonSummaryStore, type SeasonSummaryStore } from "./season-summary-store.js";
import { SqliteSeasonSummaryStore } from "./sqlite-season-summary-store.js";

// Vitest's bundler can't resolve `node:sqlite` at static analysis time
// (Node 22+ builtin), so we pull DatabaseSync via createRequire -- runs
// in the same process but bypasses Vite's module graph.
type DatabaseSyncCtor = new (path: string) => { exec(sql: string): void };
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: DatabaseSyncCtor;
};

// Run the same contract against both implementations: the in-memory store
// backs tests and local runs, but prod runs the SQLite one.
const stores: Array<{ name: string; create: () => Promise<SeasonSummaryStore> }> = [
  { name: "InMemorySeasonSummaryStore", create: async () => new InMemorySeasonSummaryStore() },
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

const overallEntry = (id: string, name: string, rank: number, score: number) => ({
  id, name, rank, score, tiles: score * 2, incomePerMinute: score / 10, techs: 3
});

describe.each(stores)("season participation ($name)", ({ create }) => {
  it("records every player in the full leaderboard, not just a top-N", async () => {
    const store = await create();
    const overall = [
      overallEntry("player-1", "Nauticus", 1, 100),
      overallEntry("player-2", "Valka", 2, 80),
      overallEntry("player-9", "Longtail", 9, 5)
    ];
    await store.recordSeasonParticipation("season-1", 1, 1_000, overall);

    const longtail = await store.listParticipationForPlayer("player-9");
    expect(longtail).toEqual([
      { seasonId: "season-1", seasonSequence: 1, playerId: "player-9", playerName: "Longtail", rank: 9, score: 5, tiles: 10, incomePerMinute: 0.5, techs: 3, endedAt: 1_000 }
    ]);
  });

  it("accumulates one row per season a player participated in, newest first", async () => {
    const store = await create();
    await store.recordSeasonParticipation("season-1", 1, 1_000, [overallEntry("player-1", "Nauticus", 3, 40)]);
    await store.recordSeasonParticipation("season-2", 2, 2_000, [overallEntry("player-1", "Nauticus", 1, 90)]);

    const history = await store.listParticipationForPlayer("player-1");
    expect(history.map((row) => row.seasonId)).toEqual(["season-2", "season-1"]);
    expect(history.map((row) => row.rank)).toEqual([1, 3]);
  });

  it("is idempotent: recording the same season twice does not duplicate the row", async () => {
    const store = await create();
    await store.recordSeasonParticipation("season-1", 1, 1_000, [overallEntry("player-1", "Nauticus", 5, 20)]);
    await store.recordSeasonParticipation("season-1", 1, 1_000, [overallEntry("player-1", "Nauticus", 5, 20)]);

    const history = await store.listParticipationForPlayer("player-1");
    expect(history).toHaveLength(1);
  });

  it("returns nothing for a player with no season history", async () => {
    const store = await create();
    await store.recordSeasonParticipation("season-1", 1, 1_000, [overallEntry("player-1", "Nauticus", 1, 100)]);
    expect(await store.listParticipationForPlayer("player-unknown")).toEqual([]);
  });
});
