import type { DatabaseSync } from "node:sqlite";

import { MAX_HALL_OF_FAME } from "./galaxy-duke-engine/galaxy-duke-config.js";
import { FIRST_ERA, type EraState, type HallEntry } from "./galaxy-duke-engine/galaxy-duke-convergence.js";
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
      CREATE TABLE IF NOT EXISTS galaxy_court_era (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        era INTEGER NOT NULL,
        started_at INTEGER NOT NULL,
        baseline_captured INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS galaxy_hall_of_fame (
        era INTEGER PRIMARY KEY,
        ended_at INTEGER NOT NULL,
        entry_json TEXT NOT NULL
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

  async getEra(now: number): Promise<EraState> {
    const row = this.db.prepare(`SELECT era, started_at, baseline_captured FROM galaxy_court_era WHERE id = 1`).get() as
      | { era: number; started_at: number; baseline_captured: number }
      | undefined;
    if (row) return { era: row.era, startedAt: row.started_at, baselineCaptured: row.baseline_captured };
    const first = FIRST_ERA(now);
    this.writeEra(first);
    return first;
  }

  private writeEra(era: EraState): void {
    this.db
      .prepare(
        `INSERT INTO galaxy_court_era (id, era, started_at, baseline_captured) VALUES (1, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET era = excluded.era, started_at = excluded.started_at, baseline_captured = excluded.baseline_captured`
      )
      .run(era.era, era.startedAt, era.baselineCaptured);
  }

  async endEra(entry: HallEntry, next: EraState): Promise<void> {
    this.db.exec("BEGIN");
    try {
      this.db.prepare(`INSERT OR REPLACE INTO galaxy_hall_of_fame (era, ended_at, entry_json) VALUES (?, ?, ?)`).run(entry.era, entry.endedAt, JSON.stringify(entry));
      this.db.prepare(`DELETE FROM galaxy_hall_of_fame WHERE era NOT IN (SELECT era FROM galaxy_hall_of_fame ORDER BY era DESC LIMIT ?)`).run(MAX_HALL_OF_FAME);
      this.db.exec(`DELETE FROM galaxy_court_contributions`);
      this.writeEra(next);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  async getHallOfFame(): Promise<HallEntry[]> {
    const rows = this.db.prepare(`SELECT entry_json FROM galaxy_hall_of_fame ORDER BY era DESC LIMIT ?`).all(MAX_HALL_OF_FAME) as { entry_json: string }[];
    return rows.map((r) => JSON.parse(r.entry_json) as HallEntry);
  }
}
