import type { DatabaseSync } from "node:sqlite";

import { pruneDiplomacyHistory } from "./social-store-diplomacy-history.js";

// Expiry and season-reset SQL for SqliteGatewaySocialStore, extracted out of
// social-store-sqlite.ts to keep it under the repo's 500-line cap. A table
// added to the store gets its expiry and its season reset here.

/** Deletes rows whose own expiry has passed (startup, and whenever the social state sweeps). */
export function pruneExpiredSocialRows(db: DatabaseSync, now: number): void {
  pruneDiplomacyHistory(db, now);
  db.prepare("DELETE FROM social_forced_truce_cooldowns WHERE cooldown_until <= ?").run(now);
  db.prepare(`DELETE FROM social_offer_cooldowns WHERE until <= ?`).run(now);
  db.prepare(`DELETE FROM social_truce_requests WHERE expires_at <= ? AND settlement_phase IS NULL`).run(now);
  db.prepare(`DELETE FROM social_active_truces WHERE ends_at <= ?`).run(now);
  db.prepare(`DELETE FROM social_completed_alliance_breaks WHERE notification_expires_at <= ?`).run(now);
  db.prepare(`DELETE FROM social_truce_lockouts WHERE lockout_until <= ?`).run(now);
}

/** Empties every season-scoped social table at a new season. */
export function clearSeasonSocialTables(db: DatabaseSync): void {
  db.exec("DELETE FROM social_forced_truce_cooldowns");
  db.exec(`DELETE FROM social_alliances`);
  db.exec(`DELETE FROM social_alliance_requests`);
  db.exec(`DELETE FROM social_alliance_breaks`);
  db.exec(`DELETE FROM social_completed_alliance_breaks`);
  db.exec(`DELETE FROM social_truce_requests`);
  db.exec(`DELETE FROM social_active_truces`);
  db.exec(`DELETE FROM social_truce_lockouts`);
  db.exec(`DELETE FROM social_truce_breaks`);
  db.exec(`DELETE FROM social_offer_cooldowns`);
  db.exec(`DELETE FROM social_diplomacy_history`);
}
