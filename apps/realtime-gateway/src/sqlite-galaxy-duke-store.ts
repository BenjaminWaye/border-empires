import type { DatabaseSync } from "node:sqlite";

import type { DukeState } from "./galaxy-duke-engine/galaxy-duke-types.js";
import { emptyCourtRecord, type GalaxyCourtRecord, type GalaxyDukeStore } from "./galaxy-duke-store/galaxy-duke-store.js";

type StateRow = { auth_uid: string; state_json: string };
type ContributionRow = { auth_uid: string; influence: number };

// Duke state is a bounded document (every list inside it is hard-capped by
// galaxy-duke-config), stored as JSON per Duke.
export class SqliteGalaxyDukeStore implements GalaxyDukeStore {
  constructor(private readonly db: DatabaseSync) {}

  async applySchema(): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS galaxy_duke_state (
        auth_uid TEXT PRIMARY KEY,
        state_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS galaxy_court_contributions (
        auth_uid TEXT PRIMARY KEY,
        influence INTEGER NOT NULL
      );
    `);
  }

  async get(authUid: string): Promise<DukeState | undefined> {
    const row = this.db.prepare(`SELECT auth_uid, state_json FROM galaxy_duke_state WHERE auth_uid = ?`).get(authUid) as StateRow | undefined;
    return row ? (JSON.parse(row.state_json) as DukeState) : undefined;
  }

  async put(state: DukeState): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO galaxy_duke_state (auth_uid, state_json, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(auth_uid) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at`
      )
      .run(state.authUid, JSON.stringify(state), state.lastAdvancedAt);
  }

  async getAll(): Promise<DukeState[]> {
    const rows = this.db.prepare(`SELECT auth_uid, state_json FROM galaxy_duke_state`).all() as StateRow[];
    return rows.map((r) => JSON.parse(r.state_json) as DukeState);
  }

  async getCourt(): Promise<GalaxyCourtRecord> {
    const rows = this.db.prepare(`SELECT auth_uid, influence FROM galaxy_court_contributions`).all() as ContributionRow[];
    const record = emptyCourtRecord();
    for (const r of rows) {
      record.contributions[r.auth_uid] = r.influence;
      record.totalInfluence += r.influence;
    }
    return record;
  }

  async addCourtContribution(authUid: string, influence: number): Promise<GalaxyCourtRecord> {
    this.db
      .prepare(
        `INSERT INTO galaxy_court_contributions (auth_uid, influence) VALUES (?, ?)
         ON CONFLICT(auth_uid) DO UPDATE SET influence = influence + excluded.influence`
      )
      .run(authUid, influence);
    return this.getCourt();
  }
}
