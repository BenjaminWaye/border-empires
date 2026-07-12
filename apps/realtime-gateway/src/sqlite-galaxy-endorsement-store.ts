import type { DatabaseSync } from "node:sqlite";

import type { GalaxyEndorsementRecord, GalaxyEndorsementStore } from "./galaxy-endorsement-store/galaxy-endorsement-store.js";

type Row = {
  ended_season_id: string;
  emperor_player_id: string;
  target_player_id: string;
  created_at: number;
  applied_at: number | null;
};

const toRecord = (row: Row): GalaxyEndorsementRecord => ({
  endedSeasonId: row.ended_season_id,
  emperorPlayerId: row.emperor_player_id,
  targetPlayerId: row.target_player_id,
  createdAt: row.created_at,
  ...(typeof row.applied_at === "number" ? { appliedAt: row.applied_at } : {})
});

const SELECT_COLUMNS = "ended_season_id, emperor_player_id, target_player_id, created_at, applied_at";

export class SqliteGalaxyEndorsementStore implements GalaxyEndorsementStore {
  constructor(private readonly db: DatabaseSync, private readonly now: () => number = () => Date.now()) {}

  async applySchema(): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS galaxy_endorsements (
        ended_season_id TEXT PRIMARY KEY,
        emperor_player_id TEXT NOT NULL,
        target_player_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        applied_at INTEGER
      );
    `);
  }

  async getByEndedSeasonId(endedSeasonId: string): Promise<GalaxyEndorsementRecord | undefined> {
    const row = this.db
      .prepare(`SELECT ${SELECT_COLUMNS} FROM galaxy_endorsements WHERE ended_season_id = ?`)
      .get(endedSeasonId) as Row | undefined;
    return row ? toRecord(row) : undefined;
  }

  async upsert(input: { endedSeasonId: string; emperorPlayerId: string; targetPlayerId: string }): Promise<GalaxyEndorsementRecord> {
    const now = this.now();
    this.db
      .prepare(
        `INSERT INTO galaxy_endorsements (ended_season_id, emperor_player_id, target_player_id, created_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(ended_season_id) DO UPDATE SET
           emperor_player_id = excluded.emperor_player_id,
           target_player_id = excluded.target_player_id`
      )
      .run(input.endedSeasonId, input.emperorPlayerId, input.targetPlayerId, now);
    const row = this.db
      .prepare(`SELECT ${SELECT_COLUMNS} FROM galaxy_endorsements WHERE ended_season_id = ?`)
      .get(input.endedSeasonId) as Row;
    return toRecord(row);
  }

  async markApplied(endedSeasonId: string): Promise<void> {
    this.db
      .prepare(`UPDATE galaxy_endorsements SET applied_at = ? WHERE ended_season_id = ?`)
      .run(this.now(), endedSeasonId);
  }
}
