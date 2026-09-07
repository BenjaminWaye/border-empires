import type { DatabaseSync } from "node:sqlite";

import type {
  GalaxyContestedEntry,
  GalaxyDefenseCampaignStore,
  GalaxyOwnershipTransfer
} from "./galaxy-defense-campaign-store/galaxy-defense-campaign-store.js";

type ContestedRow = { id: number; target_season_id: string; target_auth_uid: string; queued_at: number };
type TransferRow = { original_season_id: string; current_owner_auth_uid: string; transferred_at: number; won_via_season_id: string };

const toTransfer = (row: TransferRow): GalaxyOwnershipTransfer => ({
  originalSeasonId: row.original_season_id,
  currentOwnerAuthUid: row.current_owner_auth_uid,
  transferredAt: row.transferred_at,
  wonViaSeasonId: row.won_via_season_id
});

export class SqliteGalaxyDefenseCampaignStore implements GalaxyDefenseCampaignStore {
  constructor(private readonly db: DatabaseSync) {}

  async applySchema(): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS galaxy_contested_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        target_season_id TEXT NOT NULL,
        target_auth_uid TEXT NOT NULL,
        queued_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS galaxy_ownership_transfers (
        original_season_id TEXT PRIMARY KEY,
        current_owner_auth_uid TEXT NOT NULL,
        transferred_at INTEGER NOT NULL,
        won_via_season_id TEXT NOT NULL
      );
    `);
  }

  async enqueueContested(entry: GalaxyContestedEntry): Promise<void> {
    this.db
      .prepare(`INSERT INTO galaxy_contested_queue (target_season_id, target_auth_uid, queued_at) VALUES (?, ?, ?)`)
      .run(entry.targetSeasonId, entry.targetAuthUid, entry.queuedAt);
  }

  async popOldestContested(): Promise<GalaxyContestedEntry | undefined> {
    const row = this.db.prepare(`SELECT * FROM galaxy_contested_queue ORDER BY id ASC LIMIT 1`).get() as ContestedRow | undefined;
    if (!row) return undefined;
    this.db.prepare(`DELETE FROM galaxy_contested_queue WHERE id = ?`).run(row.id);
    return { targetSeasonId: row.target_season_id, targetAuthUid: row.target_auth_uid, queuedAt: row.queued_at };
  }

  async getQueueLength(): Promise<number> {
    const row = this.db.prepare(`SELECT COUNT(*) as count FROM galaxy_contested_queue`).get() as { count: number };
    return row.count;
  }

  async recordTransfer(transfer: GalaxyOwnershipTransfer): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO galaxy_ownership_transfers (original_season_id, current_owner_auth_uid, transferred_at, won_via_season_id)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(original_season_id) DO UPDATE SET current_owner_auth_uid = excluded.current_owner_auth_uid, transferred_at = excluded.transferred_at, won_via_season_id = excluded.won_via_season_id`
      )
      .run(transfer.originalSeasonId, transfer.currentOwnerAuthUid, transfer.transferredAt, transfer.wonViaSeasonId);
  }

  async getTransferForSeasonId(originalSeasonId: string): Promise<GalaxyOwnershipTransfer | undefined> {
    const row = this.db
      .prepare(`SELECT * FROM galaxy_ownership_transfers WHERE original_season_id = ?`)
      .get(originalSeasonId) as TransferRow | undefined;
    return row ? toTransfer(row) : undefined;
  }

  async getAllTransfers(): Promise<GalaxyOwnershipTransfer[]> {
    const rows = this.db.prepare(`SELECT * FROM galaxy_ownership_transfers`).all() as TransferRow[];
    return rows.map(toTransfer);
  }
}
