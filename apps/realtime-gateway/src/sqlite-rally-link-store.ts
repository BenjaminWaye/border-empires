import type { DatabaseSync } from "node:sqlite";

import type { CreateRallyLinkInput, RallyLink, RallyLinkStore } from "./rally-link-store/rally-link-store.js";

type Row = {
  code: string;
  owner_player_id: string;
  owner_name: string;
  note: string | null;
  anchor_x: number;
  anchor_y: number;
  anchor_island: string;
  created_at: number;
  expires_at: number;
  max_uses: number;
  uses: number;
  revoked_at: number | null;
};

const toRallyLink = (row: Row): RallyLink => ({
  code: row.code,
  ownerPlayerId: row.owner_player_id,
  ownerName: row.owner_name,
  ...(row.note ? { note: row.note } : {}),
  anchor: { x: row.anchor_x, y: row.anchor_y, island: row.anchor_island },
  createdAt: row.created_at,
  expiresAt: row.expires_at,
  maxUses: row.max_uses,
  uses: row.uses,
  ...(row.revoked_at !== null ? { revokedAt: row.revoked_at } : {})
});

const selectColumns = `
  code, owner_player_id, owner_name, note, anchor_x, anchor_y, anchor_island,
  created_at, expires_at, max_uses, uses, revoked_at
`;

export class SqliteRallyLinkStore implements RallyLinkStore {
  constructor(private readonly db: DatabaseSync) {}

  async applySchema(): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS rally_links (
        code TEXT PRIMARY KEY,
        owner_player_id TEXT NOT NULL,
        owner_name TEXT NOT NULL,
        note TEXT,
        anchor_x INTEGER NOT NULL,
        anchor_y INTEGER NOT NULL,
        anchor_island TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        max_uses INTEGER NOT NULL,
        uses INTEGER NOT NULL DEFAULT 0,
        revoked_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS rally_links_owner_active_idx ON rally_links (owner_player_id, expires_at DESC, created_at DESC);
      CREATE INDEX IF NOT EXISTS rally_links_owner_created_idx ON rally_links (owner_player_id, created_at DESC);
    `);
  }

  async create(input: CreateRallyLinkInput): Promise<RallyLink> {
    const row = this.db
      .prepare(
        `
        INSERT INTO rally_links (
          code, owner_player_id, owner_name, note, anchor_x, anchor_y, anchor_island,
          created_at, expires_at, max_uses, uses
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        RETURNING ${selectColumns}
        `
      )
      .get(
        input.code,
        input.ownerPlayerId,
        input.ownerName,
        input.note ?? null,
        input.anchor.x,
        input.anchor.y,
        input.anchor.island,
        input.createdAt,
        input.expiresAt,
        input.maxUses
      ) as Row;
    return toRallyLink(row);
  }

  async get(code: string): Promise<RallyLink | undefined> {
    const row = this.db.prepare(`SELECT ${selectColumns} FROM rally_links WHERE code = ?`).get(code) as Row | undefined;
    return row ? toRallyLink(row) : undefined;
  }

  async listActiveForOwner(ownerPlayerId: string, now: number): Promise<RallyLink[]> {
    const rows = this.db
      .prepare(
        `
        SELECT ${selectColumns}
        FROM rally_links
        WHERE owner_player_id = ? AND revoked_at IS NULL AND expires_at > ? AND uses < max_uses
        ORDER BY created_at DESC
        `
      )
      .all(ownerPlayerId, now) as Row[];
    return rows.map(toRallyLink);
  }

  async countCreatedSince(ownerPlayerId: string, since: number): Promise<number> {
    const row = this.db
      .prepare(`SELECT COUNT(*) AS count FROM rally_links WHERE owner_player_id = ? AND created_at >= ?`)
      .get(ownerPlayerId, since) as { count: number } | undefined;
    return row?.count ?? 0;
  }

  async revoke(ownerPlayerId: string, code: string, now: number): Promise<boolean> {
    const result = this.db
      .prepare(`UPDATE rally_links SET revoked_at = ? WHERE code = ? AND owner_player_id = ? AND revoked_at IS NULL`)
      .run(now, code, ownerPlayerId);
    return result.changes > 0;
  }

  async consume(code: string, now: number): Promise<RallyLink | undefined> {
    const row = this.db
      .prepare(
        `
        UPDATE rally_links
        SET uses = uses + 1
        WHERE code = ? AND revoked_at IS NULL AND expires_at > ? AND uses < max_uses
        RETURNING ${selectColumns}
        `
      )
      .get(code, now) as Row | undefined;
    return row ? toRallyLink(row) : undefined;
  }

  async releaseUse(code: string): Promise<void> {
    this.db.prepare(`UPDATE rally_links SET uses = max(uses - 1, 0) WHERE code = ?`).run(code);
  }
}
