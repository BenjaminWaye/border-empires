import type { DatabaseSync } from "node:sqlite";

import {
  DECAYING_MEMORY_FIELDS,
  MAX_DIPLOMACY_MEMORY_PAIRS,
  type Decaying,
  type DecayingMemoryField,
  type StoredDiplomacyMemoryPair
} from "../ai-diplomacy-memory/ai-diplomacy-memory-record.js";
import type { DiplomacyMemoryRemoval } from "../ai-diplomacy-memory/ai-diplomacy-memory-writer.js";

// What each AI remembers about each player (ai-diplomacy-memory.ts) in SQLite,
// kept out of social-store-sqlite.ts, which is near the repo's 500-line cap.
// One row per (AI, player) pair holding the raw fading values ({value, at})
// and timestamps, so decay keeps running from the stored times after a
// restart. Bounded like the memory: evicted pairs are deleted as they go, rows
// past `expires_at` (everything faded) are pruned with the other expiring
// social rows, and the table is capped at MAX_DIPLOMACY_MEMORY_PAIRS by
// `touched_at`. Season-scoped: cleared with the other season tables.

const TABLE = "social_ai_diplomacy_memory";

const columnOf = (field: DecayingMemoryField): string => field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
const DECAYING_COLUMNS = DECAYING_MEMORY_FIELDS.flatMap(([field]) => [columnOf(field), `${columnOf(field)}_at`]);
const ALL_COLUMNS = [
  "ai_player_id",
  "player_id",
  ...DECAYING_COLUMNS,
  "last_player_attack_at",
  "last_combat_at",
  "ai_paid_for_peace_at",
  "touched_at",
  "expires_at"
];

export function applyAiDiplomacyMemorySchema(db: DatabaseSync): void {
  db.exec(`CREATE TABLE IF NOT EXISTS ${TABLE} (
      ai_player_id TEXT NOT NULL,
      player_id TEXT NOT NULL,
      ${DECAYING_COLUMNS.map((column) => `${column} REAL NOT NULL`).join(",\n      ")},
      last_player_attack_at INTEGER,
      last_combat_at INTEGER,
      ai_paid_for_peace_at INTEGER,
      touched_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      PRIMARY KEY (ai_player_id, player_id)
    );
    CREATE INDEX IF NOT EXISTS ${TABLE}_expires_idx ON ${TABLE} (expires_at);
    CREATE INDEX IF NOT EXISTS ${TABLE}_touched_idx ON ${TABLE} (touched_at);`);
}

type Row = Record<string, unknown>;

const numberOr = (value: unknown, fallback: number): number => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
const optionalNumber = (value: unknown): number | undefined => (typeof value === "number" && Number.isFinite(value) ? value : undefined);

export const aiDiplomacyMemoryFromRow = (row: Row): StoredDiplomacyMemoryPair[] => {
  if (typeof row.ai_player_id !== "string" || typeof row.player_id !== "string") return [];
  const touchedAt = numberOr(row.touched_at, 0);
  const decaying = Object.fromEntries(
    DECAYING_MEMORY_FIELDS.map(([field]) => [
      field,
      { value: numberOr(row[columnOf(field)], 0), at: numberOr(row[`${columnOf(field)}_at`], touchedAt) }
    ])
  ) as Record<DecayingMemoryField, Decaying>;
  return [{
    ...decaying,
    aiPlayerId: row.ai_player_id,
    playerId: row.player_id,
    lastPlayerAttackAt: optionalNumber(row.last_player_attack_at),
    lastCombatAt: optionalNumber(row.last_combat_at),
    aiPaidForPeaceAt: optionalNumber(row.ai_paid_for_peace_at),
    touchedAt,
    expiresAt: numberOr(row.expires_at, 0)
  }];
};

const rowValues = (pair: StoredDiplomacyMemoryPair): Array<string | number | null> => [
  pair.aiPlayerId,
  pair.playerId,
  ...DECAYING_MEMORY_FIELDS.flatMap(([field]) => [pair[field].value, pair[field].at]),
  pair.lastPlayerAttackAt ?? null,
  pair.lastCombatAt ?? null,
  pair.aiPaidForPeaceAt ?? null,
  pair.touchedAt,
  pair.expiresAt
];

/** Least recently touched first, the order the memory rebuilds its LRU in. */
export function loadAiDiplomacyMemory(db: DatabaseSync): StoredDiplomacyMemoryPair[] {
  const rows = db.prepare(`SELECT ${ALL_COLUMNS.join(", ")} FROM ${TABLE} ORDER BY touched_at ASC`).all() as Row[];
  return rows.flatMap(aiDiplomacyMemoryFromRow);
}

/** Upserts changed pairs and deletes evicted/pruned ones in one transaction. */
export function writeAiDiplomacyMemory(db: DatabaseSync, upserts: readonly StoredDiplomacyMemoryPair[], removals: readonly DiplomacyMemoryRemoval[]): void {
  if (upserts.length === 0 && removals.length === 0) return;
  const upsert = db.prepare(
    `INSERT INTO ${TABLE} (${ALL_COLUMNS.join(", ")}) VALUES (${ALL_COLUMNS.map(() => "?").join(", ")})
     ON CONFLICT(ai_player_id, player_id) DO UPDATE SET
       ${ALL_COLUMNS.slice(2).map((column) => `${column} = excluded.${column}`).join(",\n       ")}`
  );
  const remove = db.prepare(`DELETE FROM ${TABLE} WHERE ai_player_id = ? AND player_id = ?`);
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const removal of removals) remove.run(removal.aiPlayerId, removal.playerId);
    for (const pair of upserts) upsert.run(...rowValues(pair));
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/** Drops pairs whose memory has all faded, then any beyond the cap (least recently touched first). */
export function pruneAiDiplomacyMemory(db: DatabaseSync, now: number): void {
  db.prepare(`DELETE FROM ${TABLE} WHERE expires_at <= ?`).run(now);
  db.prepare(
    `DELETE FROM ${TABLE} WHERE rowid IN (SELECT rowid FROM ${TABLE} ORDER BY touched_at DESC LIMIT -1 OFFSET ?)`
  ).run(MAX_DIPLOMACY_MEMORY_PAIRS);
}

export function clearAiDiplomacyMemory(db: DatabaseSync): void {
  db.exec(`DELETE FROM ${TABLE}`);
}
