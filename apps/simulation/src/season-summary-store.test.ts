import { describe, expect, it } from "vitest";

import { PostgresSeasonSummaryStore } from "./season-summary-store.js";
import { buildSimulationSnapshotSections } from "./snapshot-store.js";
import type { CurrentSeasonSummary, SeasonArchiveRow } from "@border-empires/sim-protocol";

describe("season summary store", () => {
  it("resets operational tables with ordered deletes before inserting the next season snapshot", async () => {
    const queries: string[] = [];
    const db = {
      async query(sql: string) {
        queries.push(sql.trim());
        if (sql.includes("RETURNING snapshot_id")) {
          return { rows: [{ snapshot_id: 77 }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      },
      async connect() {
        return {
          query: this.query,
          release: () => undefined
        };
      }
    };

    const store = new PostgresSeasonSummaryStore(db);
    const currentSummary: CurrentSeasonSummary = {
      season: "season-2",
      seasonId: "season-2",
      seasonSequence: 2,
      status: "active",
      startedAt: 2_000,
      worldSeed: 123,
      rulesetId: "seasonal-default",
      leaderboard: { overall: [], byTiles: [], byIncome: [], byTechs: [] },
      overall: [],
      byTiles: [],
      byIncome: [],
      byTechs: [],
      seasonVictory: [],
      onlinePlayers: 0,
      totalPlayers: 10,
      townCount: 88,
      updatedAt: 2_100
    };
    const archiveSummary: SeasonArchiveRow = {
      seasonId: "season-1",
      seasonSequence: 1,
      endedAt: 1_900,
      updatedAt: 1_900,
      mostTerritory: [],
      mostPoints: [],
      longestSurvivalMs: [],
      replayEvents: []
    };

    await store.startNextSeason({
      archiveSummary,
      snapshotSections: buildSimulationSnapshotSections({
        initialState: {
          tiles: [],
          activeLocks: [],
          players: [],
          pendingSettlements: [],
          tileYieldCollectedAtByTile: [],
          collectVisibleCooldownByPlayer: []
        },
        commands: [],
        eventsByCommandId: new Map()
      }),
      currentSummary,
      createdAt: 2_100
    });

    expect(queries).toContain("DELETE FROM world_snapshots");
    expect(queries).not.toContain(
      "TRUNCATE command_results, commands, world_events, world_snapshots, checkpoint_metadata, player_projection_current, tile_projection_current, combat_lock_projection_current, visibility_projection_current, world_status_current"
    );
    expect(queries.indexOf("DELETE FROM checkpoint_metadata")).toBeLessThan(queries.indexOf("DELETE FROM world_snapshots"));
    expect(queries.indexOf("DELETE FROM world_status_current")).toBeLessThan(queries.indexOf("DELETE FROM world_snapshots"));
  });
});
