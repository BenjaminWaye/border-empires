import type { DatabaseSync } from "node:sqlite";

import type { PersonalActivityDiplomacyEvent } from "@border-empires/game-domain";
import { OFFER_NOTE_MAX_LENGTH } from "@border-empires/shared";
import {
  DIPLOMACY_HISTORY_PER_PLAYER_CAP,
  DIPLOMACY_HISTORY_TTL_MS,
  type DiplomacyHistoryEntry,
  type StoredDiplomacyHistoryEntry
} from "../social-state/social-diplomacy-history.js";
import { fealtyFromJson } from "./social-store-sqlite-alliances.js";

// Chronicle diplomacy rows (social-diplomacy-history.ts) in SQLite, kept out
// of social-store-sqlite.ts, which is near the repo's 500-line cap. One row
// per player per event; bounded per player on write and to the timeline's
// 24h window by pruneExpired, like the in-memory history.

const DIPLOMACY_EVENTS: ReadonlySet<string> = new Set<PersonalActivityDiplomacyEvent>([
  "TRUCE_OFFERED",
  "TRUCE_STARTED",
  "TRUCE_EXTENDED",
  "TRUCE_ENDED",
  "TRUCE_BROKEN",
  "ALLIANCE_OFFERED",
  "ALLIANCE_DECLINED",
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
  ends_at: number | null;
  by_player_id: string | null;
  court: number | null;
  fealty_json?: string | null;
  note?: string | null;
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
      court INTEGER,
      ends_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS social_diplomacy_history_player_idx ON social_diplomacy_history (player_id, occurred_at);
    CREATE INDEX IF NOT EXISTS social_diplomacy_history_at_idx ON social_diplomacy_history (occurred_at);`);
  // Added after the table shipped: a truce row's end (Chronicle "ends Sun 00:45").
  const columns = db.prepare("PRAGMA table_info(social_diplomacy_history)").all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "ends_at")) db.exec("ALTER TABLE social_diplomacy_history ADD COLUMN ends_at INTEGER");
  // Later still: an alliance row's recorded fealty (alliance-fealty.ts in shared); NULL reads plain "alliance".
  if (!columns.some((column) => column.name === "fealty_json")) db.exec("ALTER TABLE social_diplomacy_history ADD COLUMN fealty_json TEXT");
  // Later again: an offer row's note (diplomacy-offer-notes.ts in shared), at most 140 characters; bounded with the rows.
  if (!columns.some((column) => column.name === "note")) db.exec("ALTER TABLE social_diplomacy_history ADD COLUMN note TEXT");
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
    ...(row.ends_at !== null && row.ends_at !== undefined ? { endsAt: row.ends_at } : {}),
    ...(row.by_player_id !== null ? { byPlayerId: row.by_player_id } : {}),
    ...(row.court ? { court: true } : {}),
    ...fealtyFromJson(row.fealty_json),
    ...(typeof row.note === "string" && row.note.length > 0 ? { note: row.note.slice(0, OFFER_NOTE_MAX_LENGTH) } : {})
  }];
};

export function loadDiplomacyHistory(db: DatabaseSync): StoredDiplomacyHistoryEntry[] {
  const rows = db
    .prepare(
      `SELECT player_id, event, occurred_at, counterparty_player_id, counterparty_name, duration_hours, ends_at, by_player_id, court, fealty_json, note
       FROM social_diplomacy_history`
    )
    .all() as DiplomacyHistoryRow[];
  return rows.flatMap(diplomacyHistoryFromRow);
}

export function saveDiplomacyHistory(db: DatabaseSync, playerId: string, entry: DiplomacyHistoryEntry): void {
  db.prepare(
    `INSERT INTO social_diplomacy_history (player_id, event, occurred_at, counterparty_player_id, counterparty_name, duration_hours, ends_at, by_player_id, court, fealty_json, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(playerId, entry.event, entry.occurredAt, entry.counterpartyPlayerId, entry.counterpartyName, entry.durationHours ?? null, entry.endsAt ?? null, entry.byPlayerId ?? null, entry.court ? 1 : null, entry.fealty ? JSON.stringify(entry.fealty) : null, entry.note ?? null);
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
