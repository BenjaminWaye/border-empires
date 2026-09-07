import type { DatabaseSync } from "node:sqlite";

import type { GalaxyExplorationStore, GalaxySurveySnapshot, RecordSurveyInput } from "./galaxy-exploration-store/galaxy-exploration-store.js";

type Row = {
  auth_uid: string;
  season_id: string;
  stability: number;
  garrison: number;
  surveyed_at: number;
};

const toSnapshot = (row: Row): GalaxySurveySnapshot => ({
  authUid: row.auth_uid,
  seasonId: row.season_id,
  stability: row.stability,
  garrison: row.garrison,
  surveyedAt: row.surveyed_at
});

export class SqliteGalaxyExplorationStore implements GalaxyExplorationStore {
  constructor(private readonly db: DatabaseSync) {}

  async applySchema(): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS galaxy_survey_snapshot (
        auth_uid TEXT NOT NULL,
        season_id TEXT NOT NULL,
        stability INTEGER NOT NULL,
        garrison INTEGER NOT NULL,
        surveyed_at INTEGER NOT NULL,
        PRIMARY KEY (auth_uid, season_id)
      );
      CREATE INDEX IF NOT EXISTS galaxy_survey_snapshot_owner_idx ON galaxy_survey_snapshot (auth_uid);
    `);
  }

  async recordSurvey(input: RecordSurveyInput): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO galaxy_survey_snapshot (auth_uid, season_id, stability, garrison, surveyed_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (auth_uid, season_id) DO UPDATE SET stability = excluded.stability, garrison = excluded.garrison, surveyed_at = excluded.surveyed_at`
      )
      .run(input.authUid, input.seasonId, input.stability, input.garrison, input.surveyedAt);
  }

  async getSurveysForOwner(authUid: string): Promise<GalaxySurveySnapshot[]> {
    const rows = this.db.prepare(`SELECT * FROM galaxy_survey_snapshot WHERE auth_uid = ?`).all(authUid) as Row[];
    return rows.map(toSnapshot);
  }
}
