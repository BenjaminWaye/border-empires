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
      { seasonId: "season-1", seasonSequence: 1, playerId: "player-9", playerName: "Longtail", rank: 9, score: 5, tiles: 10, incomePerMinute: 0.5, techs: 3, endedAt: 1_000, ratingBefore: 1200, ratingAfter: 1184 }
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

  it("carries each player's ELO from season to season based on final rank", async () => {
    const store = await create();
    await store.recordSeasonParticipation("season-1", 1, 1_000, [overallEntry("player-1", "Nauticus", 1, 90), overallEntry("player-2", "Valka", 2, 40)]);
    await store.recordSeasonParticipation("season-2", 2, 2_000, [overallEntry("player-1", "Nauticus", 2, 50), overallEntry("player-2", "Valka", 1, 70)]);

    const [latest, first] = await store.listParticipationForPlayer("player-1");
    expect(first).toMatchObject({ ratingBefore: 1200, ratingAfter: 1216 });
    expect(latest).toMatchObject({ ratingBefore: 1216, ratingAfter: 1199 });
  });

  it("re-recording a season recomputes the same ratings instead of compounding them", async () => {
    const store = await create();
    const overall = [overallEntry("player-1", "Nauticus", 1, 90), overallEntry("player-2", "Valka", 2, 40)];
    await store.recordSeasonParticipation("season-1", 1, 1_000, overall);
    await store.recordSeasonParticipation("season-1", 1, 1_000, overall);

    expect((await store.listParticipationForPlayer("player-1"))[0]).toMatchObject({ ratingBefore: 1200, ratingAfter: 1216 });
  });

  it("a retried rollover drops players no longer on the final leaderboard instead of rating stale ranks", async () => {
    const store = await create();
    await store.recordSeasonParticipation("season-1", 1, 1_000, [
      overallEntry("player-1", "Nauticus", 1, 90), overallEntry("player-2", "Valka", 2, 40), overallEntry("player-3", "Quitter", 3, 1)
    ]);
    await store.recordSeasonParticipation("season-1", 1, 1_000, [overallEntry("player-1", "Nauticus", 1, 90), overallEntry("player-2", "Valka", 2, 40)]);

    expect(await store.listParticipationForPlayer("player-3")).toEqual([]);
    expect((await store.listParticipationForPlayer("player-1"))[0]).toMatchObject({ ratingBefore: 1200, ratingAfter: 1216 });
  });

  it("returns nothing for a player with no season history", async () => {
    const store = await create();
    await store.recordSeasonParticipation("season-1", 1, 1_000, [overallEntry("player-1", "Nauticus", 1, 100)]);
    expect(await store.listParticipationForPlayer("player-unknown")).toEqual([]);
  });
});

describe("SqliteSeasonSummaryStore ELO backfill", () => {
  it("adds the rating columns to a pre-feature season_participation table and rates its rows", async () => {
    const db = new DatabaseSync(":memory:") as ConstructorParameters<typeof SqliteSeasonSummaryStore>[0];
    db.exec(`CREATE TABLE season_participation (
      season_id TEXT NOT NULL, season_sequence INTEGER NOT NULL, player_id TEXT NOT NULL, player_name TEXT NOT NULL,
      rank INTEGER NOT NULL, score REAL NOT NULL, tiles REAL NOT NULL, income_per_minute REAL NOT NULL, techs INTEGER NOT NULL,
      ended_at INTEGER NOT NULL, PRIMARY KEY (season_id, player_id)
    );
    INSERT INTO season_participation VALUES ('season-1', 1, 'player-1', 'Nauticus', 1, 90, 180, 9, 3, 1000);
    INSERT INTO season_participation VALUES ('season-1', 1, 'player-2', 'Valka', 2, 40, 80, 4, 3, 1000);`);
    const store = new SqliteSeasonSummaryStore(db);
    await store.applySchema();

    expect((await store.listParticipationForPlayer("player-2"))[0]).toMatchObject({ ratingBefore: 1200, ratingAfter: 1184 });
  });

  it("rates seasons recorded before ratings existed, oldest first, on schema apply", async () => {
    const db = new DatabaseSync(":memory:") as ConstructorParameters<typeof SqliteSeasonSummaryStore>[0];
    const store = new SqliteSeasonSummaryStore(db);
    await store.applySchema();
    await store.recordSeasonParticipation("season-1", 1, 1_000, [overallEntry("player-1", "Nauticus", 1, 90), overallEntry("player-2", "Valka", 2, 40)]);
    await store.recordSeasonParticipation("season-2", 2, 2_000, [overallEntry("player-1", "Nauticus", 2, 50), overallEntry("player-2", "Valka", 1, 70)]);
    // Simulate rows written by a build that predates ratings.
    db.exec(`UPDATE season_participation SET rating_before = NULL, rating_after = NULL`);
    expect((await store.listParticipationForPlayer("player-1"))[0]).not.toHaveProperty("ratingAfter");

    await new SqliteSeasonSummaryStore(db).applySchema();

    const [latest, first] = await store.listParticipationForPlayer("player-1");
    expect(first).toMatchObject({ ratingBefore: 1200, ratingAfter: 1216 });
    expect(latest).toMatchObject({ ratingBefore: 1216, ratingAfter: 1199 });
  });
});
