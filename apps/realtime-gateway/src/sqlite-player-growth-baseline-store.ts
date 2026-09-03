import type { DatabaseSync } from "node:sqlite";

import type { PlayerGrowthBaselineStore, StoredPlayerGrowthBaseline } from "./player-growth-baseline-store/player-growth-baseline-store.js";

type Row = {
  player_id: string;
  income_per_minute: number;
  manpower_cap: number;
  recorded_at: number;
};

const toBaseline = (row: Row): StoredPlayerGrowthBaseline => ({
  playerId: row.player_id,
  incomePerMinute: row.income_per_minute,
  manpowerCap: row.manpower_cap,
  recordedAt: row.recorded_at
});

export class SqlitePlayerGrowthBaselineStore implements PlayerGrowthBaselineStore {
  constructor(private readonly db: DatabaseSync) {}

  async applySchema(): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS player_growth_baseline (
        player_id TEXT PRIMARY KEY,
        income_per_minute REAL NOT NULL,
        manpower_cap REAL NOT NULL,
        recorded_at INTEGER NOT NULL
      );
    `);
  }

  async get(playerId: string): Promise<StoredPlayerGrowthBaseline | undefined> {
    const row = this.db
      .prepare(`SELECT player_id, income_per_minute, manpower_cap, recorded_at FROM player_growth_baseline WHERE player_id = ? LIMIT 1`)
      .get(playerId) as Row | undefined;
    return row ? toBaseline(row) : undefined;
  }

  async set(baseline: StoredPlayerGrowthBaseline): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO player_growth_baseline (player_id, income_per_minute, manpower_cap, recorded_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(player_id) DO UPDATE SET
           income_per_minute = excluded.income_per_minute,
           manpower_cap = excluded.manpower_cap,
           recorded_at = excluded.recorded_at`
      )
      .run(baseline.playerId, baseline.incomePerMinute, baseline.manpowerCap, baseline.recordedAt);
  }
}
