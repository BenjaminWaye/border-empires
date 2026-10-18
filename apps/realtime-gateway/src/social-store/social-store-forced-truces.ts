import type { DatabaseSync } from "node:sqlite";
/** Additive schema; old seasons and ordinary truces retain their semantics. */
export function applyForcedTruceSchema(db: DatabaseSync): void {
  if (!db.prepare("PRAGMA table_info(social_active_truces)").all().some(row => row.name === "origin")) db.exec("ALTER TABLE social_active_truces ADD COLUMN origin TEXT");
  db.exec(`CREATE TABLE IF NOT EXISTS social_forced_truce_cooldowns (player_id TEXT PRIMARY KEY, cooldown_until INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS social_forced_truce_cooldowns_until_idx ON social_forced_truce_cooldowns (cooldown_until);`);
}
export function loadForcedTruceCooldowns(db: DatabaseSync, now: number): Array<{ playerId: string; cooldownUntil: number }> {
  return db.prepare("SELECT player_id, cooldown_until FROM social_forced_truce_cooldowns WHERE cooldown_until > ?").all(now)
    .map(row => ({ playerId: String(row.player_id), cooldownUntil: Number(row.cooldown_until) }));
}
