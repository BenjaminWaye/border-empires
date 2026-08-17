import type { DatabaseSync } from "node:sqlite";

import {
  WORLD_ENGINE_STRIKE_HISTORY_WINDOW_MS,
  type WorldEngineStrikeRecord,
  type WorldEngineStrikeStore
} from "./world-engine-strike-store/world-engine-strike-store.js";

type Row = {
  strike_id: string;
  occurred_at: number;
  caster_name: string;
  target_x: number;
  target_y: number;
  town_name: string;
  population_tier: string;
  population_lost: number;
  target_owner_name: string;
};

const toRecord = (row: Row): WorldEngineStrikeRecord => ({
  strikeId: row.strike_id,
  occurredAt: row.occurred_at,
  casterName: row.caster_name,
  targetX: row.target_x,
  targetY: row.target_y,
  townName: row.town_name,
  populationTier: row.population_tier,
  populationLost: row.population_lost,
  targetOwnerName: row.target_owner_name
});

const SELECT_COLUMNS =
  "strike_id, occurred_at, caster_name, target_x, target_y, town_name, population_tier, population_lost, target_owner_name";

export class SqliteWorldEngineStrikeStore implements WorldEngineStrikeStore {
  constructor(private readonly db: DatabaseSync, private readonly now: () => number = () => Date.now()) {}

  async applySchema(): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS world_engine_strikes (
        strike_id TEXT PRIMARY KEY,
        occurred_at INTEGER NOT NULL,
        caster_name TEXT NOT NULL,
        target_x INTEGER NOT NULL,
        target_y INTEGER NOT NULL,
        town_name TEXT NOT NULL,
        population_tier TEXT NOT NULL,
        population_lost INTEGER NOT NULL,
        target_owner_name TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS world_engine_strikes_occurred_at_idx ON world_engine_strikes(occurred_at);
    `);
  }

  async insert(record: WorldEngineStrikeRecord): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO world_engine_strikes
           (strike_id, occurred_at, caster_name, target_x, target_y, town_name, population_tier, population_lost, target_owner_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(strike_id) DO NOTHING`
      )
      .run(
        record.strikeId,
        record.occurredAt,
        record.casterName,
        record.targetX,
        record.targetY,
        record.townName,
        record.populationTier,
        record.populationLost,
        record.targetOwnerName
      );
    const cutoff = this.now() - WORLD_ENGINE_STRIKE_HISTORY_WINDOW_MS;
    this.db.prepare(`DELETE FROM world_engine_strikes WHERE occurred_at < ?`).run(cutoff);
  }

  async listSince(sinceMs: number): Promise<WorldEngineStrikeRecord[]> {
    const rows = this.db
      .prepare(`SELECT ${SELECT_COLUMNS} FROM world_engine_strikes WHERE occurred_at >= ? ORDER BY occurred_at DESC`)
      .all(sinceMs) as Row[];
    return rows.map(toRecord);
  }
}
