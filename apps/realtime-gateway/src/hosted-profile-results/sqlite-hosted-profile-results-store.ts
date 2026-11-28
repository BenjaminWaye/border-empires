import type { DatabaseSync } from "node:sqlite";

import type { HostedProfileResult, HostedProfileResultsStore } from "./hosted-profile-results-store.js";

type Row = { player_id: string; sector_id: string; ended_at: number; finished: number; rank: number; houses: number };

// Personal data: scripts/account-deletion/erase-account-data.mjs deletes an
// erased account's rows (PERSONAL_TABLES).
export class SqliteHostedProfileResultsStore implements HostedProfileResultsStore {
  constructor(private readonly db: DatabaseSync) {}

  async applySchema(): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS hosted_profile_results (
        player_id TEXT NOT NULL,
        sector_id TEXT NOT NULL,
        ended_at INTEGER NOT NULL,
        finished INTEGER NOT NULL,
        rank INTEGER NOT NULL,
        houses INTEGER NOT NULL,
        PRIMARY KEY (player_id, sector_id)
      );
    `);
  }

  async record(results: readonly HostedProfileResult[]): Promise<void> {
    const upsert = this.db.prepare(
      "INSERT INTO hosted_profile_results (player_id, sector_id, ended_at, finished, rank, houses) VALUES (?, ?, ?, ?, ?, ?) " +
        "ON CONFLICT (player_id, sector_id) DO UPDATE SET ended_at = excluded.ended_at, finished = excluded.finished, rank = excluded.rank, houses = excluded.houses"
    );
    this.db.exec("BEGIN");
    try {
      for (const r of results) upsert.run(r.playerId, r.sectorId, r.endedAt, r.finished ? 1 : 0, r.rank, r.houses);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  async listForPlayer(playerId: string, limit: number): Promise<HostedProfileResult[]> {
    const rows = this.db
      .prepare("SELECT player_id, sector_id, ended_at, finished, rank, houses FROM hosted_profile_results WHERE player_id = ? ORDER BY ended_at DESC LIMIT ?")
      .all(playerId, limit) as Row[];
    return rows.map((row) => ({ playerId: row.player_id, sectorId: row.sector_id, endedAt: Number(row.ended_at), finished: row.finished === 1, rank: Number(row.rank), houses: Number(row.houses) }));
  }
}
