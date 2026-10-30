import type { DatabaseSync } from "node:sqlite";

import type { PersonalActivityDiplomacyEvent } from "@border-empires/game-domain";
import {
  DIPLOMACY_HISTORY_PER_PLAYER_CAP,
  DIPLOMACY_HISTORY_TTL_MS,
  type DiplomacyHistoryEntry,
  type StoredDiplomacyHistoryEntry
} from "../social-state/social-diplomacy-history.js";

// Chronicle diplomacy rows (social-diplomacy-history.ts) in SQLite, kept out
// of social-store-sqlite.ts, which is near the repo's 500-line cap. One row
// per player per event; bounded per player on write and to the timeline's
// 24h window by pruneExpired, like the in-memory history.

const DIPLOMACY_EVENTS: ReadonlySet<string> = new Set<PersonalActivityDiplomacyEvent>([
  "TRUCE_STARTED",
  "TRUCE_ENDED",
  "TRUCE_BROKEN",
  "ALLIANCE_FORMED",
  "ALLIANCE_BROKEN"
]);

type DiplomacyHistoryRow = {
  player_id: string;
  event: string;
  occurred_at: number;
  counterparty_player_id: string;
  counterparty_name: string;
  duration_hours: number | null;
  by_player_id: string | null;
  court: number | null;
};

export function applyDiplomacyHistorySchema(db: DatabaseSync): void {
  db.exec(`CREATE TABLE IF NOT EXISTS social_diplomacy_history (
      player_id TEXT NOT NULL,
      event TEXT NOT NULL,
      occurred_at INTEGER NOT NULL,
      counterparty_player_id TEXT NOT NULL,
      counterparty_name TEXT NOT NULL,
      duration_hours INTEGER,
      by_player_id TEXT,
      court INTEGER
    );
    CREATE INDEX IF NOT EXISTS social_diplomacy_history_player_idx ON social_diplomacy_history (player_id, occurred_at);
    CREATE INDEX IF NOT EXISTS social_diplomacy_history_at_idx ON social_diplomacy_history (occurred_at);`);
}

/** A row from an unknown event (say, written by a newer gateway) is skipped rather than misread. */
export const diplomacyHistoryFromRow = (row: DiplomacyHistoryRow): StoredDiplomacyHistoryEntry[] => {
  if (!DIPLOMACY_EVENTS.has(row.event)) return [];
  return [{
    playerId: row.player_id,
    event: row.event as PersonalActivityDiplomacyEvent,
    occurredAt: row.occurred_at,
    counterpartyPlayerId: row.counterparty_player_id,
    counterpartyName: row.counterparty_name,
    ...(row.duration_hours !== null ? { durationHours: row.duration_hours } : {}),
    ...(row.by_player_id !== null ? { byPlayerId: row.by_player_id } : {}),
    ...(row.court ? { court: true } : {})
  }];
};

export function loadDiplomacyHistory(db: DatabaseSync): StoredDiplomacyHistoryEntry[] {
  const rows = db
    .prepare(
      `SELECT player_id, event, occurred_at, counterparty_player_id, counterparty_name, duration_hours, by_player_id, court
       FROM social_diplomacy_history`
    )
    .all() as DiplomacyHistoryRow[];
  return rows.flatMap(diplomacyHistoryFromRow);
}

export function saveDiplomacyHistory(db: DatabaseSync, playerId: string, entry: DiplomacyHistoryEntry): void {
  db.prepare(
    `INSERT INTO social_diplomacy_history (player_id, event, occurred_at, counterparty_player_id, counterparty_name, duration_hours, by_player_id, court)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(playerId, entry.event, entry.occurredAt, entry.counterpartyPlayerId, entry.counterpartyName, entry.durationHours ?? null, entry.byPlayerId ?? null, entry.court ? 1 : null);
  db.prepare(
    `DELETE FROM social_diplomacy_history
     WHERE player_id = ? AND rowid NOT IN (
       SELECT rowid FROM social_diplomacy_history WHERE player_id = ? ORDER BY occurred_at DESC, rowid DESC LIMIT ?
     )`
  ).run(playerId, playerId, DIPLOMACY_HISTORY_PER_PLAYER_CAP);
}

export function pruneDiplomacyHistory(db: DatabaseSync, now: number): void {
  db.prepare(`DELETE FROM social_diplomacy_history WHERE occurred_at < ?`).run(now - DIPLOMACY_HISTORY_TTL_MS);
}
