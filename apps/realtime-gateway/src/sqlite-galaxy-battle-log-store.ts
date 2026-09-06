import type { DatabaseSync } from "node:sqlite";

import type { CreateBattleLogEntryInput, GalaxyBattleLogEntry, GalaxyBattleLogStore } from "./galaxy-battle-log-store/galaxy-battle-log-store.js";

type Row = {
  id: string;
  attacker_auth_uid: string;
  defender_auth_uid: string;
  target_season_id: string;
  recon_only: number;
  damage_dealt: number;
  net_damage: number;
  stability_after: number;
  resolved_at: number;
};

const toEntry = (row: Row): GalaxyBattleLogEntry => ({
  id: row.id,
  attackerAuthUid: row.attacker_auth_uid,
  defenderAuthUid: row.defender_auth_uid,
  targetSeasonId: row.target_season_id,
  reconOnly: row.recon_only === 1,
  damageDealt: row.damage_dealt,
  netDamage: row.net_damage,
  stabilityAfter: row.stability_after,
  resolvedAt: row.resolved_at
});

export class SqliteGalaxyBattleLogStore implements GalaxyBattleLogStore {
  private nextId = 1;

  constructor(private readonly db: DatabaseSync) {}

  async applySchema(): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS galaxy_battle_log (
        id TEXT PRIMARY KEY,
        attacker_auth_uid TEXT NOT NULL,
        defender_auth_uid TEXT NOT NULL,
        target_season_id TEXT NOT NULL,
        recon_only INTEGER NOT NULL,
        damage_dealt INTEGER NOT NULL,
        net_damage INTEGER NOT NULL,
        stability_after INTEGER NOT NULL,
        resolved_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS galaxy_battle_log_resolved_at_idx ON galaxy_battle_log (resolved_at DESC);
    `);
  }

  private nextEntryId(): string {
    if (this.nextId === 1) {
      const row = this.db.prepare(`SELECT id FROM galaxy_battle_log ORDER BY rowid DESC LIMIT 1`).get() as { id: string } | undefined;
      const match = row?.id.match(/^battle-(\d+)$/);
      if (match?.[1]) this.nextId = Number.parseInt(match[1], 10) + 1;
    }
    return `battle-${this.nextId++}`;
  }

  async recordRaid(input: CreateBattleLogEntryInput): Promise<GalaxyBattleLogEntry> {
    const id = this.nextEntryId();
    this.db
      .prepare(
        `INSERT INTO galaxy_battle_log
           (id, attacker_auth_uid, defender_auth_uid, target_season_id, recon_only, damage_dealt, net_damage, stability_after, resolved_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.attackerAuthUid,
        input.defenderAuthUid,
        input.targetSeasonId,
        input.reconOnly ? 1 : 0,
        input.damageDealt,
        input.netDamage,
        input.stabilityAfter,
        input.resolvedAt
      );
    const row = this.db.prepare(`SELECT * FROM galaxy_battle_log WHERE id = ?`).get(id) as Row;
    return toEntry(row);
  }

  async listRecent(limit: number): Promise<GalaxyBattleLogEntry[]> {
    const rows = this.db.prepare(`SELECT * FROM galaxy_battle_log ORDER BY resolved_at DESC LIMIT ?`).all(limit) as Row[];
    return rows.map(toEntry);
  }
}
