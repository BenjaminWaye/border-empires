import { createResilientPostgresPool } from "./postgres-pool.js";
import type { CreateRallyLinkInput, RallyLink, RallyLinkStore } from "./rally-link-store.js";

type QueryResultRow = Record<string, unknown>;
type Queryable = {
  query: <TRow extends QueryResultRow = QueryResultRow>(
    sql: string,
    params?: readonly unknown[]
  ) => Promise<{ rows: TRow[]; rowCount: number | null }>;
};

type RallyLinkRow = {
  code: string;
  owner_player_id: string;
  owner_name: string;
  note: string | null;
  anchor_x: number | string;
  anchor_y: number | string;
  anchor_island: string;
  created_at: number | string;
  expires_at: number | string;
  max_uses: number | string;
  uses: number | string;
  revoked_at: number | string | null;
};

const dbNumber = (value: number | string | null | undefined): number => Number(value ?? 0);

const toRallyLink = (row: RallyLinkRow): RallyLink => ({
  code: row.code,
  ownerPlayerId: row.owner_player_id,
  ownerName: row.owner_name,
  ...(row.note ? { note: row.note } : {}),
  anchor: { x: dbNumber(row.anchor_x), y: dbNumber(row.anchor_y), island: row.anchor_island },
  createdAt: dbNumber(row.created_at),
  expiresAt: dbNumber(row.expires_at),
  maxUses: dbNumber(row.max_uses),
  uses: dbNumber(row.uses),
  ...(row.revoked_at !== null && row.revoked_at !== undefined ? { revokedAt: dbNumber(row.revoked_at) } : {})
});

const selectColumns = `
  code, owner_player_id, owner_name, note, anchor_x, anchor_y, anchor_island,
  created_at, expires_at, max_uses, uses, revoked_at
`;

export class PostgresRallyLinkStore implements RallyLinkStore {
  constructor(private readonly db: Queryable) {}

  async applySchema(sql: string): Promise<void> {
    await this.db.query(sql);
  }

  async create(input: CreateRallyLinkInput): Promise<RallyLink> {
    const result = await this.db.query<RallyLinkRow>(
      `
      INSERT INTO rally_links (
        code, owner_player_id, owner_name, note, anchor_x, anchor_y, anchor_island,
        created_at, expires_at, max_uses, uses
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0)
      RETURNING ${selectColumns}
      `,
      [
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
      ]
    );
    if (!result.rows[0]) throw new Error("failed to create rally link");
    return toRallyLink(result.rows[0]);
  }

  async get(code: string): Promise<RallyLink | undefined> {
    const result = await this.db.query<RallyLinkRow>(`SELECT ${selectColumns} FROM rally_links WHERE code = $1`, [code]);
    return result.rows[0] ? toRallyLink(result.rows[0]) : undefined;
  }

  async listActiveForOwner(ownerPlayerId: string, now: number): Promise<RallyLink[]> {
    const result = await this.db.query<RallyLinkRow>(
      `
      SELECT ${selectColumns}
      FROM rally_links
      WHERE owner_player_id = $1 AND revoked_at IS NULL AND expires_at > $2 AND uses < max_uses
      ORDER BY created_at DESC
      `,
      [ownerPlayerId, now]
    );
    return result.rows.map(toRallyLink);
  }

  async countCreatedSince(ownerPlayerId: string, since: number): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM rally_links WHERE owner_player_id = $1 AND created_at >= $2`,
      [ownerPlayerId, since]
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async revoke(ownerPlayerId: string, code: string, now: number): Promise<boolean> {
    const result = await this.db.query(
      `UPDATE rally_links SET revoked_at = $3 WHERE code = $1 AND owner_player_id = $2 AND revoked_at IS NULL`,
      [code, ownerPlayerId, now]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async consume(code: string, now: number): Promise<RallyLink | undefined> {
    const result = await this.db.query<RallyLinkRow>(
      `
      UPDATE rally_links
      SET uses = uses + 1
      WHERE code = $1 AND revoked_at IS NULL AND expires_at > $2 AND uses < max_uses
      RETURNING ${selectColumns}
      `,
      [code, now]
    );
    return result.rows[0] ? toRallyLink(result.rows[0]) : undefined;
  }

  async releaseUse(code: string): Promise<void> {
    await this.db.query(`UPDATE rally_links SET uses = GREATEST(uses - 1, 0) WHERE code = $1`, [code]);
  }
}

export const createPostgresRallyLinkStore = (connectionString: string): PostgresRallyLinkStore =>
  new PostgresRallyLinkStore(createResilientPostgresPool(connectionString, "gateway-rally-link-store"));
