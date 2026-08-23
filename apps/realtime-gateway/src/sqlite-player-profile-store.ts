import type { DatabaseSync } from "node:sqlite";

import type { GatewayPlayerProfileStore, StoredPlayerProfile } from "./player-profile-store/player-profile-store.js";

type Row = {
  player_id: string;
  display_name: string | null;
  tile_color: string | null;
  profile_complete: number | null;
  name_changed_season_id: string | null;
  color_changed_season_id: string | null;
  country_flag: string | null;
  updated_at: number;
};

const toProfile = (row: Row): StoredPlayerProfile => ({
  playerId: row.player_id,
  ...(row.display_name ? { name: row.display_name } : {}),
  ...(row.tile_color ? { tileColor: row.tile_color } : {}),
  ...(row.country_flag ? { countryFlag: row.country_flag } : {}),
  ...(row.profile_complete !== null ? { profileComplete: row.profile_complete === 1 } : {}),
  ...(row.name_changed_season_id ? { nameChangedSeasonId: row.name_changed_season_id } : {}),
  ...(row.color_changed_season_id ? { colorChangedSeasonId: row.color_changed_season_id } : {}),
  updatedAt: row.updated_at
});

export class SqliteGatewayPlayerProfileStore implements GatewayPlayerProfileStore {
  constructor(private readonly db: DatabaseSync, private readonly now: () => number = () => Date.now()) {}

  async applySchema(): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS player_profiles (
        player_id TEXT PRIMARY KEY,
        display_name TEXT,
        tile_color TEXT,
        profile_complete INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS player_profiles_updated_at_idx ON player_profiles (updated_at DESC);
    `);
    try {
      this.db.exec(`ALTER TABLE player_profiles ADD COLUMN name_changed_season_id TEXT;`);
    } catch {
      // Column already exists from a previous applySchema() call.
    }
    try {
      this.db.exec(`ALTER TABLE player_profiles ADD COLUMN color_changed_season_id TEXT;`);
    } catch {
      // Column already exists from a previous applySchema() call.
    }
    try {
      this.db.exec(`ALTER TABLE player_profiles ADD COLUMN country_flag TEXT;`);
    } catch {
      // Column already exists from a previous applySchema() call.
    }
  }

  async get(playerId: string): Promise<StoredPlayerProfile | undefined> {
    const row = this.db
      .prepare(`SELECT player_id, display_name, tile_color, profile_complete, name_changed_season_id, color_changed_season_id, country_flag, updated_at FROM player_profiles WHERE player_id = ?`)
      .get(playerId) as Row | undefined;
    return row ? toProfile(row) : undefined;
  }

  async getMany(playerIds: Iterable<string>): Promise<StoredPlayerProfile[]> {
    const ids = [...new Set([...playerIds].filter((id) => id.trim().length > 0))];
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => "?").join(",");
    const rows = this.db
      .prepare(
        `SELECT player_id, display_name, tile_color, profile_complete, name_changed_season_id, color_changed_season_id, country_flag, updated_at
         FROM player_profiles
         WHERE player_id IN (${placeholders})`
      )
      .all(...ids) as Row[];
    return rows.map(toProfile);
  }

  async listAllNamed(): Promise<StoredPlayerProfile[]> {
    const rows = this.db
      .prepare(
        `SELECT player_id, display_name, tile_color, profile_complete, name_changed_season_id, color_changed_season_id, country_flag, updated_at
         FROM player_profiles
         WHERE display_name IS NOT NULL AND length(display_name) > 0`
      )
      .all() as Row[];
    return rows.map(toProfile);
  }

  async setTileColor(playerId: string, tileColor: string, colorChangedSeasonId?: string): Promise<StoredPlayerProfile> {
    const now = this.now();
    const row = this.db
      .prepare(
        `INSERT INTO player_profiles (player_id, tile_color, color_changed_season_id, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(player_id) DO UPDATE SET
           tile_color = excluded.tile_color,
           color_changed_season_id = COALESCE(excluded.color_changed_season_id, player_profiles.color_changed_season_id),
           updated_at = excluded.updated_at
         RETURNING player_id, display_name, tile_color, profile_complete, name_changed_season_id, color_changed_season_id, country_flag, updated_at`
      )
      .get(playerId, tileColor, colorChangedSeasonId ?? null, now) as Row;
    return toProfile(row);
  }

  async setProfile(playerId: string, name: string, tileColor: string, nameChangedSeasonId?: string, colorChangedSeasonId?: string): Promise<StoredPlayerProfile> {
    const now = this.now();
    const row = this.db
      .prepare(
        `INSERT INTO player_profiles (player_id, display_name, tile_color, profile_complete, name_changed_season_id, color_changed_season_id, updated_at)
         VALUES (?, ?, ?, 1, ?, ?, ?)
         ON CONFLICT(player_id) DO UPDATE SET
           display_name = excluded.display_name,
           tile_color = excluded.tile_color,
           profile_complete = excluded.profile_complete,
           name_changed_season_id = COALESCE(excluded.name_changed_season_id, player_profiles.name_changed_season_id),
           color_changed_season_id = COALESCE(excluded.color_changed_season_id, player_profiles.color_changed_season_id),
           updated_at = excluded.updated_at
         RETURNING player_id, display_name, tile_color, profile_complete, name_changed_season_id, color_changed_season_id, country_flag, updated_at`
      )
      .get(playerId, name, tileColor, nameChangedSeasonId ?? null, colorChangedSeasonId ?? null, now) as Row;
    return toProfile(row);
  }

  async setCountryFlag(playerId: string, countryFlag: string): Promise<StoredPlayerProfile> {
    const now = this.now();
    const row = this.db
      .prepare(
        `INSERT INTO player_profiles (player_id, country_flag, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(player_id) DO UPDATE SET
           country_flag = excluded.country_flag,
           updated_at = excluded.updated_at
         RETURNING player_id, display_name, tile_color, profile_complete, name_changed_season_id, color_changed_season_id, country_flag, updated_at`
      )
      .get(playerId, countryFlag, now) as Row;
    return toProfile(row);
  }
}
