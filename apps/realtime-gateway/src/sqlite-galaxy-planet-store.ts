import type { DatabaseSync } from "node:sqlite";

import type {
  GalaxyPlanetChristenResult,
  GalaxyPlanetRecord,
  GalaxyPlanetStore
} from "./galaxy-planet-store/galaxy-planet-store.js";

type Row = {
  season_id: string;
  owner_auth_uid: string;
  planet_name: string;
  named_at: number;
};

const toRecord = (row: Row): GalaxyPlanetRecord => ({
  seasonId: row.season_id,
  ownerAuthUid: row.owner_auth_uid,
  planetName: row.planet_name,
  namedAt: row.named_at
});

export class SqliteGalaxyPlanetStore implements GalaxyPlanetStore {
  constructor(private readonly db: DatabaseSync, private readonly now: () => number = () => Date.now()) {}

  async applySchema(): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS galaxy_planets (
        season_id TEXT PRIMARY KEY,
        owner_auth_uid TEXT NOT NULL,
        planet_name TEXT NOT NULL,
        named_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS galaxy_planets_owner_idx ON galaxy_planets (owner_auth_uid);
    `);
  }

  async getBySeasonId(seasonId: string): Promise<GalaxyPlanetRecord | undefined> {
    const row = this.db
      .prepare(`SELECT season_id, owner_auth_uid, planet_name, named_at FROM galaxy_planets WHERE season_id = ?`)
      .get(seasonId) as Row | undefined;
    return row ? toRecord(row) : undefined;
  }

  async getByOwner(ownerAuthUid: string): Promise<GalaxyPlanetRecord[]> {
    const rows = this.db
      .prepare(
        `SELECT season_id, owner_auth_uid, planet_name, named_at
         FROM galaxy_planets
         WHERE owner_auth_uid = ?
         ORDER BY named_at DESC`
      )
      .all(ownerAuthUid) as Row[];
    return rows.map(toRecord);
  }

  async christen(input: {
    seasonId: string;
    ownerAuthUid: string;
    planetName: string;
  }): Promise<GalaxyPlanetChristenResult> {
    const now = this.now();
    const result = this.db
      .prepare(
        `INSERT INTO galaxy_planets (season_id, owner_auth_uid, planet_name, named_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(season_id) DO NOTHING`
      )
      .run(input.seasonId, input.ownerAuthUid, input.planetName, now);
    const row = this.db
      .prepare(`SELECT season_id, owner_auth_uid, planet_name, named_at FROM galaxy_planets WHERE season_id = ?`)
      .get(input.seasonId) as Row;
    return { inserted: Number(result.changes) === 1, record: toRecord(row) };
  }
}
