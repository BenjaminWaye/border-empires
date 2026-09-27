import type { DatabaseSync } from "node:sqlite";

import {
  ACQUISITION_STEPS,
  type AcquisitionStep,
  type AcquisitionStepRow,
  type PlayerFunnelMilestone,
  type PlayerFunnelMilestoneDetail,
  type PlayerFunnelPruneLimits,
  type PlayerFunnelRow,
  type PlayerFunnelStore,
  type PlayerSessionRow
} from "./player-funnel-store.js";

type PlayerRow = {
  player_id: string;
  first_seen_at: number;
  last_seen_at: number;
  account_new: number;
  spawned_at: number | null;
  first_move_at: number | null;
  first_move_type: string | null;
  ten_tiles_at: number | null;
  first_contact_at: number | null;
  first_contact_with: string | null;
  first_contact_is_ai: number | null;
  first_interaction_at: number | null;
  first_interaction_type: string | null;
  first_interaction_with: string | null;
  first_interaction_is_ai: number | null;
};

type SessionRow = { id: number; player_id: string; started_at: number; ended_at: number };
type AcquisitionRow = { visitor_id: string; step: string; at: number; detail_json: string };

// Column names per milestone: [at, type, with, is_ai]. Fixed strings only —
// never interpolate caller input into SQL.
const MILESTONE_COLUMNS: Record<PlayerFunnelMilestone, readonly [string, string | null, string | null, string | null]> = {
  spawned: ["spawned_at", null, null, null],
  first_move: ["first_move_at", "first_move_type", null, null],
  ten_tiles: ["ten_tiles_at", null, null, null],
  first_contact: ["first_contact_at", null, "first_contact_with", "first_contact_is_ai"],
  first_interaction: ["first_interaction_at", "first_interaction_type", "first_interaction_with", "first_interaction_is_ai"]
};

const toPlayer = (row: PlayerRow): PlayerFunnelRow => ({
  playerId: row.player_id,
  firstSeenAt: row.first_seen_at,
  lastSeenAt: row.last_seen_at,
  accountNew: row.account_new === 1,
  ...(row.spawned_at !== null ? { spawnedAt: row.spawned_at } : {}),
  ...(row.first_move_at !== null ? { firstMoveAt: row.first_move_at } : {}),
  ...(row.first_move_type !== null ? { firstMoveType: row.first_move_type } : {}),
  ...(row.ten_tiles_at !== null ? { tenTilesAt: row.ten_tiles_at } : {}),
  ...(row.first_contact_at !== null ? { firstContactAt: row.first_contact_at } : {}),
  ...(row.first_contact_with !== null ? { firstContactWith: row.first_contact_with } : {}),
  ...(row.first_contact_is_ai !== null ? { firstContactIsAi: row.first_contact_is_ai === 1 } : {}),
  ...(row.first_interaction_at !== null ? { firstInteractionAt: row.first_interaction_at } : {}),
  ...(row.first_interaction_type !== null ? { firstInteractionType: row.first_interaction_type } : {}),
  ...(row.first_interaction_with !== null ? { firstInteractionWith: row.first_interaction_with } : {}),
  ...(row.first_interaction_is_ai !== null ? { firstInteractionIsAi: row.first_interaction_is_ai === 1 } : {})
});

const toSession = (row: SessionRow): PlayerSessionRow => ({ id: row.id, playerId: row.player_id, startedAt: row.started_at, endedAt: row.ended_at });

const isAcquisitionStep = (value: string): value is AcquisitionStep => (ACQUISITION_STEPS as readonly string[]).includes(value);

const parseDetail = (json: string): Record<string, string> => {
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  } catch {
    return {};
  }
};

export class SqlitePlayerFunnelStore implements PlayerFunnelStore {
  constructor(private readonly db: DatabaseSync) {}

  async applySchema(): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS player_funnel (
        player_id TEXT PRIMARY KEY,
        first_seen_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        account_new INTEGER NOT NULL,
        spawned_at INTEGER,
        first_move_at INTEGER,
        first_move_type TEXT,
        ten_tiles_at INTEGER,
        first_contact_at INTEGER,
        first_contact_with TEXT,
        first_contact_is_ai INTEGER,
        first_interaction_at INTEGER,
        first_interaction_type TEXT,
        first_interaction_with TEXT,
        first_interaction_is_ai INTEGER
      );
      CREATE TABLE IF NOT EXISTS player_funnel_session (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        player_id TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        ended_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS player_funnel_session_player_idx ON player_funnel_session (player_id, started_at);
      CREATE INDEX IF NOT EXISTS player_funnel_session_ended_idx ON player_funnel_session (ended_at);
      CREATE TABLE IF NOT EXISTS player_funnel_acquisition (
        visitor_id TEXT NOT NULL,
        step TEXT NOT NULL,
        at INTEGER NOT NULL,
        detail_json TEXT NOT NULL,
        PRIMARY KEY (visitor_id, step)
      );
      CREATE INDEX IF NOT EXISTS player_funnel_acquisition_at_idx ON player_funnel_acquisition (at);
    `);
  }

  async ensurePlayer(playerId: string, at: number, accountNew: boolean): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO player_funnel (player_id, first_seen_at, last_seen_at, account_new) VALUES (?, ?, ?, ?)
         ON CONFLICT(player_id) DO UPDATE SET last_seen_at = MAX(last_seen_at, excluded.last_seen_at)`
      )
      .run(playerId, at, at, accountNew ? 1 : 0);
  }

  async recordMilestone(playerId: string, milestone: PlayerFunnelMilestone, at: number, detail?: PlayerFunnelMilestoneDetail): Promise<boolean> {
    const [atColumn, typeColumn, withColumn, isAiColumn] = MILESTONE_COLUMNS[milestone];
    const sets = [`${atColumn} = ?`];
    const values: Array<string | number | null> = [at];
    if (typeColumn) { sets.push(`${typeColumn} = ?`); values.push(detail?.type ?? null); }
    if (withColumn) { sets.push(`${withColumn} = ?`); values.push(detail?.withPlayerId ?? null); }
    if (isAiColumn) { sets.push(`${isAiColumn} = ?`); values.push(detail?.withIsAi === undefined ? null : detail.withIsAi ? 1 : 0); }
    const result = this.db
      .prepare(`UPDATE player_funnel SET ${sets.join(", ")} WHERE player_id = ? AND ${atColumn} IS NULL`)
      .run(...values, playerId);
    return Number(result.changes) > 0;
  }

  async openSession(playerId: string, startedAt: number): Promise<number> {
    const result = this.db
      .prepare(`INSERT INTO player_funnel_session (player_id, started_at, ended_at) VALUES (?, ?, ?)`)
      .run(playerId, startedAt, startedAt);
    return Number(result.lastInsertRowid);
  }

  async touchSession(sessionId: number, endedAt: number): Promise<void> {
    this.db.prepare(`UPDATE player_funnel_session SET ended_at = MAX(ended_at, ?) WHERE id = ?`).run(endedAt, sessionId);
  }

  async lastSession(playerId: string): Promise<PlayerSessionRow | undefined> {
    const row = this.db
      .prepare(`SELECT id, player_id, started_at, ended_at FROM player_funnel_session WHERE player_id = ? ORDER BY started_at DESC LIMIT 1`)
      .get(playerId) as SessionRow | undefined;
    return row ? toSession(row) : undefined;
  }

  async recordAcquisitionStep(row: AcquisitionStepRow): Promise<boolean> {
    const result = this.db
      .prepare(`INSERT OR IGNORE INTO player_funnel_acquisition (visitor_id, step, at, detail_json) VALUES (?, ?, ?, ?)`)
      .run(row.visitorId, row.step, row.at, JSON.stringify(row.detail));
    return Number(result.changes) > 0;
  }

  async listPlayers(): Promise<PlayerFunnelRow[]> {
    return (this.db.prepare(`SELECT * FROM player_funnel`).all() as PlayerRow[]).map(toPlayer);
  }

  async listSessions(sinceAt: number): Promise<PlayerSessionRow[]> {
    return (this.db
      .prepare(`SELECT id, player_id, started_at, ended_at FROM player_funnel_session WHERE ended_at >= ? ORDER BY started_at`)
      .all(sinceAt) as SessionRow[]).map(toSession);
  }

  async listAcquisitionSteps(sinceAt: number): Promise<AcquisitionStepRow[]> {
    const rows = this.db
      .prepare(`SELECT visitor_id, step, at, detail_json FROM player_funnel_acquisition WHERE at >= ?`)
      .all(sinceAt) as AcquisitionRow[];
    return rows.flatMap((row) => (isAcquisitionStep(row.step) ? [{ visitorId: row.visitor_id, step: row.step, at: row.at, detail: parseDetail(row.detail_json) }] : []));
  }

  async prune(limits: PlayerFunnelPruneLimits): Promise<void> {
    this.db.prepare(`DELETE FROM player_funnel_session WHERE ended_at < ?`).run(limits.olderThan);
    this.db.prepare(`DELETE FROM player_funnel_acquisition WHERE at < ?`).run(limits.olderThan);
    this.db
      .prepare(`DELETE FROM player_funnel_session WHERE id NOT IN (SELECT id FROM player_funnel_session ORDER BY started_at DESC LIMIT ?)`)
      .run(limits.maxSessionRows);
    this.db
      .prepare(
        `DELETE FROM player_funnel_acquisition WHERE rowid NOT IN (SELECT rowid FROM player_funnel_acquisition ORDER BY at DESC LIMIT ?)`
      )
      .run(limits.maxAcquisitionRows);
  }
}
