import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import type { CurrentSeasonSummary, SeasonArchiveRow, SeasonVictoryObjectiveSnapshot } from "@border-empires/sim-protocol";

import { InMemorySeasonSummaryStore, type SeasonSummaryStore } from "../season-summary-store.js";
import { SqliteSeasonSummaryStore } from "../sqlite-season-summary-store.js";
import { buildArchiveRow } from "./season-summary.js";

// See season-participation-store.test.ts: node:sqlite via createRequire.
type DatabaseSyncCtor = new (path: string) => { exec(sql: string): void };
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as { DatabaseSync: DatabaseSyncCtor };

const stores: Array<{ name: string; create: () => Promise<SeasonSummaryStore> }> = [
  { name: "InMemorySeasonSummaryStore", create: async () => new InMemorySeasonSummaryStore() },
  {
    name: "SqliteSeasonSummaryStore",
    create: async () => {
      const store = new SqliteSeasonSummaryStore(new DatabaseSync(":memory:") as ConstructorParameters<typeof SqliteSeasonSummaryStore>[0]);
      await store.applySchema();
      return store;
    }
  }
];

const entry = (id: string, name: string, rank: number, score: number) => ({
  id, name, rank, score, tiles: score * 2, incomePerMinute: score / 10, techs: 3, manpowerCap: 100
});

const objective: SeasonVictoryObjectiveSnapshot = {
  id: "TOWN_CONTROL", name: "Town Control", description: "Hold towns", leaderPlayerId: "player-1", leaderName: "Nauticus",
  progressLabel: "12 / 10", thresholdLabel: "10 towns", holdDurationSeconds: 3600, statusLabel: "Held", conditionMet: true
} as SeasonVictoryObjectiveSnapshot;

const endedSummary = (overall: ReturnType<typeof entry>[]): CurrentSeasonSummary => ({
  season: "season-3", seasonId: "season-3", seasonSequence: 3, status: "ended", startedAt: 1_000, endedAt: 50_000,
  worldSeed: 1, rulesetId: "seasonal-default",
  leaderboard: { overall, byTiles: [], byIncome: [], byTechs: [] } as CurrentSeasonSummary["leaderboard"],
  overall, byTiles: [], byIncome: [], byTechs: [], seasonVictory: [objective],
  onlinePlayers: 0, totalPlayers: overall.length, townCount: 0, updatedAt: 50_000
});

const legacyArchive = (seasonId: string, endedAt: number): SeasonArchiveRow => ({
  seasonId, seasonSequence: 1, endedAt, updatedAt: endedAt,
  winner: { playerId: "player-1", playerName: "Nauticus", crownedAt: endedAt, objectiveId: "TOWN_CONTROL", objectiveName: "Town Control" },
  mostTerritory: [], mostPoints: [], longestSurvivalMs: [], replayEvents: []
});

describe("buildArchiveRow recap fields", () => {
  it("archives the full final leaderboard and victory dials, not only the top 5", () => {
    const overall = Array.from({ length: 7 }, (_, index) => entry(`player-${index + 1}`, `P${index + 1}`, index + 1, 100 - index));
    const row = buildArchiveRow(endedSummary(overall));
    expect(row.mostPoints).toHaveLength(5);
    expect(row.finalStandings).toHaveLength(7);
    expect(row.finalStandings?.[6]).toEqual({ id: "player-7", name: "P7", rank: 7, score: 94, tiles: 188, incomePerMinute: 9.4, techs: 3 });
    expect(row.seasonVictory).toEqual([objective]);
  });
});

describe.each(stores)("archive standings backfill ($name)", ({ create }) => {
  it("fills finalStandings on the newest legacy archive from participation rows", async () => {
    // Regression: archives written before finalStandings existed only kept a
    // top-5 mostPoints, so the reopened recap could not list every player.
    const store = await create();
    await store.recordSeasonParticipation("season-2", 2, 2_000, [entry("player-2", "Valka", 2, 80), entry("player-1", "Nauticus", 1, 90)]);
    await store.archiveSeason(legacyArchive("season-1", 1_000));
    await store.archiveSeason(legacyArchive("season-2", 2_000));

    const [latest, older] = await store.listArchives();
    expect(latest?.finalStandings).toEqual([
      { id: "player-1", name: "Nauticus", rank: 1, score: 90, tiles: 180, incomePerMinute: 9, techs: 3 },
      { id: "player-2", name: "Valka", rank: 2, score: 80, tiles: 160, incomePerMinute: 8, techs: 3 }
    ]);
    expect(older?.finalStandings).toBeUndefined();
  });

  it("keeps finalStandings already stored on the archive", async () => {
    const store = await create();
    await store.recordSeasonParticipation("season-3", 3, 50_000, [entry("player-9", "Stale", 1, 1)]);
    await store.archiveSeason(buildArchiveRow(endedSummary([entry("player-1", "Nauticus", 1, 90)])));
    const [latest] = await store.listArchives();
    expect(latest?.finalStandings?.map((standing) => standing.id)).toEqual(["player-1"]);
  });
});
