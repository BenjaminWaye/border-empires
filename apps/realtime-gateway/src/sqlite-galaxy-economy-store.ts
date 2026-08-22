import type { DatabaseSync } from "node:sqlite";

import type {
  GalaxyEconomyBalance,
  GalaxyEconomyStore,
  GalaxyTerritoryStability,
  GalaxyTerritoryTier
} from "./galaxy-economy-store/galaxy-economy-store.js";

type BalanceRow = {
  auth_uid: string;
  influence: number;
  production: number;
  last_cycle_at: number;
};

type StabilityRow = {
  auth_uid: string;
  season_id: string;
  tier: GalaxyTerritoryTier;
  stability: number;
};

const toBalance = (row: BalanceRow): GalaxyEconomyBalance => ({
  authUid: row.auth_uid,
  influence: row.influence,
  production: row.production,
  lastCycleAt: row.last_cycle_at
});

const toStability = (row: StabilityRow): GalaxyTerritoryStability => ({
  authUid: row.auth_uid,
  seasonId: row.season_id,
  tier: row.tier,
  stability: row.stability
});

export class SqliteGalaxyEconomyStore implements GalaxyEconomyStore {
  constructor(private readonly db: DatabaseSync) {}

  async applySchema(): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS galaxy_economy_balances (
        auth_uid TEXT PRIMARY KEY,
        influence INTEGER NOT NULL,
        production INTEGER NOT NULL,
        last_cycle_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS galaxy_territory_stability (
        auth_uid TEXT NOT NULL,
        season_id TEXT NOT NULL,
        tier TEXT NOT NULL,
        stability INTEGER NOT NULL,
        PRIMARY KEY (auth_uid, season_id)
      );
      CREATE INDEX IF NOT EXISTS galaxy_territory_stability_owner_idx ON galaxy_territory_stability (auth_uid);
    `);
  }

  async getBalance(authUid: string): Promise<GalaxyEconomyBalance | undefined> {
    const row = this.db
      .prepare(`SELECT auth_uid, influence, production, last_cycle_at FROM galaxy_economy_balances WHERE auth_uid = ?`)
      .get(authUid) as BalanceRow | undefined;
    return row ? toBalance(row) : undefined;
  }

  async getAllBalances(): Promise<GalaxyEconomyBalance[]> {
    const rows = this.db
      .prepare(`SELECT auth_uid, influence, production, last_cycle_at FROM galaxy_economy_balances`)
      .all() as BalanceRow[];
    return rows.map(toBalance);
  }

  async upsertBalance(balance: GalaxyEconomyBalance): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO galaxy_economy_balances (auth_uid, influence, production, last_cycle_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(auth_uid) DO UPDATE SET influence = excluded.influence, production = excluded.production, last_cycle_at = excluded.last_cycle_at`
      )
      .run(balance.authUid, balance.influence, balance.production, balance.lastCycleAt);
  }

  async getStability(authUid: string, seasonId: string): Promise<GalaxyTerritoryStability | undefined> {
    const row = this.db
      .prepare(`SELECT auth_uid, season_id, tier, stability FROM galaxy_territory_stability WHERE auth_uid = ? AND season_id = ?`)
      .get(authUid, seasonId) as StabilityRow | undefined;
    return row ? toStability(row) : undefined;
  }

  async getStabilityForOwner(authUid: string): Promise<GalaxyTerritoryStability[]> {
    const rows = this.db
      .prepare(`SELECT auth_uid, season_id, tier, stability FROM galaxy_territory_stability WHERE auth_uid = ?`)
      .all(authUid) as StabilityRow[];
    return rows.map(toStability);
  }

  async ensureStability(input: { authUid: string; seasonId: string; tier: GalaxyTerritoryTier }): Promise<GalaxyTerritoryStability> {
    this.db
      .prepare(
        `INSERT INTO galaxy_territory_stability (auth_uid, season_id, tier, stability)
         VALUES (?, ?, ?, 100)
         ON CONFLICT(auth_uid, season_id) DO NOTHING`
      )
      .run(input.authUid, input.seasonId, input.tier);
    const row = this.db
      .prepare(`SELECT auth_uid, season_id, tier, stability FROM galaxy_territory_stability WHERE auth_uid = ? AND season_id = ?`)
      .get(input.authUid, input.seasonId) as StabilityRow;
    return toStability(row);
  }

  async setStability(authUid: string, seasonId: string, stability: number): Promise<void> {
    this.db
      .prepare(`UPDATE galaxy_territory_stability SET stability = ? WHERE auth_uid = ? AND season_id = ?`)
      .run(stability, authUid, seasonId);
  }
}
