import { createResilientPostgresPool } from "./postgres-pool.js";
import type { GatewayPlayerProfileStore, StoredPlayerProfile } from "./player-profile-store.js";

type QueryResultRow = Record<string, unknown>;

type Queryable = {
  query: <TRow extends QueryResultRow = QueryResultRow>(
    sql: string,
    params?: readonly unknown[]
  ) => Promise<{ rows: TRow[]; rowCount: number | null }>;
};

type PlayerProfileRow = {
  player_id: string;
  display_name: string | null;
  tile_color: string | null;
  profile_complete: boolean | null;
  updated_at: number | string;
};

const parseDbNumber = (value: number | string | null | undefined): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

const toStoredPlayerProfile = (row: PlayerProfileRow): StoredPlayerProfile => ({
  playerId: row.player_id,
  ...(typeof row.display_name === "string" ? { name: row.display_name } : {}),
  ...(typeof row.tile_color === "string" ? { tileColor: row.tile_color } : {}),
  ...(typeof row.profile_complete === "boolean" ? { profileComplete: row.profile_complete } : {}),
  updatedAt: parseDbNumber(row.updated_at) ?? Date.now()
});

export class PostgresGatewayPlayerProfileStore implements GatewayPlayerProfileStore {
  constructor(private readonly db: Queryable, private readonly now: () => number = () => Date.now()) {}

  async applySchema(sql: string): Promise<void> {
    await this.db.query(sql);
  }

  async get(playerId: string): Promise<StoredPlayerProfile | undefined> {
    const result = await this.db.query<PlayerProfileRow>(
      `
      SELECT player_id, display_name, tile_color, profile_complete, updated_at
      FROM player_profiles
      WHERE player_id = $1
      `,
      [playerId]
    );
    return result.rows[0] ? toStoredPlayerProfile(result.rows[0]) : undefined;
  }

  async setTileColor(playerId: string, tileColor: string): Promise<StoredPlayerProfile> {
    const now = this.now();
    const result = await this.db.query<PlayerProfileRow>(
      `
      INSERT INTO player_profiles (player_id, tile_color, updated_at)
      VALUES ($1, $2, $3)
      ON CONFLICT (player_id) DO UPDATE SET
        tile_color = EXCLUDED.tile_color,
        updated_at = EXCLUDED.updated_at
      RETURNING player_id, display_name, tile_color, profile_complete, updated_at
      `,
      [playerId, tileColor, now]
    );
    if (!result.rows[0]) throw new Error("failed to upsert player tile color");
    return toStoredPlayerProfile(result.rows[0]);
  }

  async setProfile(playerId: string, name: string, tileColor: string): Promise<StoredPlayerProfile> {
    const now = this.now();
    const result = await this.db.query<PlayerProfileRow>(
      `
      INSERT INTO player_profiles (player_id, display_name, tile_color, profile_complete, updated_at)
      VALUES ($1, $2, $3, TRUE, $4)
      ON CONFLICT (player_id) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        tile_color = EXCLUDED.tile_color,
        profile_complete = EXCLUDED.profile_complete,
        updated_at = EXCLUDED.updated_at
      RETURNING player_id, display_name, tile_color, profile_complete, updated_at
      `,
      [playerId, name, tileColor, now]
    );
    if (!result.rows[0]) throw new Error("failed to upsert player profile");
    return toStoredPlayerProfile(result.rows[0]);
  }
}

export const createPostgresGatewayPlayerProfileStore = (connectionString: string): PostgresGatewayPlayerProfileStore =>
  new PostgresGatewayPlayerProfileStore(
    createResilientPostgresPool(connectionString, "gateway-player-profile-store")
  );
