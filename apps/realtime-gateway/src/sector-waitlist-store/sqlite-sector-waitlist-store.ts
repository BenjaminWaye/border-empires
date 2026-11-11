import type { DatabaseSync } from "node:sqlite";

import type { SectorWaitlistEntry, SectorWaitlistStore } from "./sector-waitlist-store.js";

export class SqliteSectorWaitlistStore implements SectorWaitlistStore {
  constructor(private readonly db: DatabaseSync) {}

  async applySchema(): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sector_waitlist (
        season_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        joined_at INTEGER NOT NULL,
        PRIMARY KEY (season_id, player_id)
      );
    `);
  }

  async join(entry: SectorWaitlistEntry): Promise<boolean> {
    const result = this.db
      .prepare("INSERT OR IGNORE INTO sector_waitlist (season_id, player_id, joined_at) VALUES (?, ?, ?)")
      .run(entry.seasonId, entry.playerId, entry.joinedAt);
    return Number(result.changes) > 0;
  }

  async leave(seasonId: string, playerId: string): Promise<boolean> {
    const result = this.db.prepare("DELETE FROM sector_waitlist WHERE season_id = ? AND player_id = ?").run(seasonId, playerId);
    return Number(result.changes) > 0;
  }

  async has(seasonId: string, playerId: string): Promise<boolean> {
    return this.db.prepare("SELECT 1 FROM sector_waitlist WHERE season_id = ? AND player_id = ?").get(seasonId, playerId) !== undefined;
  }

  async count(seasonId: string): Promise<number> {
    const row = this.db.prepare("SELECT COUNT(*) AS n FROM sector_waitlist WHERE season_id = ?").get(seasonId) as { n: number } | undefined;
    return Number(row?.n ?? 0);
  }

  async list(seasonId: string): Promise<string[]> {
    const rows = this.db
      .prepare("SELECT player_id FROM sector_waitlist WHERE season_id = ? ORDER BY joined_at, player_id")
      .all(seasonId) as Array<{ player_id: string }>;
    return rows.map((row) => row.player_id);
  }
}
