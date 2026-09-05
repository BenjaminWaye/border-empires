// SqliteGatewaySocialStore, extracted out of social-store.ts (already over
// the repo's 500-line file-size gate and may not grow further -- see
// AGENTS.md's file-and-type-discipline rule). This is a clean, self-contained
// unit: the persistent SQLite-backed implementation of GatewaySocialStore,
// as opposed to the InMemoryGatewaySocialStore left in social-store.ts.
import type { DatabaseSync } from "node:sqlite";

import {
  MAX_TRUCE_BREAKS_PER_PLAYER,
  type SocialActiveTruce,
  type SocialAllianceBreak,
  type SocialAllianceRequest,
  type SocialCompletedAllianceBreak,
  type SocialTruceBreakRecord,
  type SocialTruceRequest
} from "../social-state/social-state.js";
import type { GatewaySocialStore, SocialStoreSnapshot } from "./social-store.js";
import { orderedPair, pairKey } from "./social-store.js";
import {
  activeTruceFromRow,
  allianceBreakFromRow,
  allianceRequestFromRow,
  completedAllianceBreakFromRow,
  truceRequestFromRow,
  type ActiveTruceRow,
  type AllianceBreakRow,
  type AllianceRequestRow,
  type AllianceRow,
  type CompletedAllianceBreakRow,
  type PlayerRow,
  type TruceBreakRow,
  type TruceLockoutRow,
  type TruceRequestRow
} from "./social-store-row-mappers.js";

export class SqliteGatewaySocialStore implements GatewaySocialStore {
  constructor(private readonly db: DatabaseSync, private readonly now: () => number = () => Date.now()) {}

  applySchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS social_players (
        player_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS social_alliances (
        player_a_id TEXT NOT NULL,
        player_b_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (player_a_id, player_b_id)
      );
      CREATE TABLE IF NOT EXISTS social_alliance_requests (
        id TEXT PRIMARY KEY,
        from_player_id TEXT NOT NULL,
        to_player_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        from_name TEXT,
        to_name TEXT
      );
      CREATE INDEX IF NOT EXISTS social_alliance_requests_to_idx ON social_alliance_requests (to_player_id);
      CREATE INDEX IF NOT EXISTS social_alliance_requests_from_idx ON social_alliance_requests (from_player_id);
      CREATE TABLE IF NOT EXISTS social_alliance_breaks (
        pair_key TEXT PRIMARY KEY,
        player_a_id TEXT NOT NULL,
        player_b_id TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        ends_at INTEGER NOT NULL,
        created_by_player_id TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS social_alliance_breaks_ends_idx ON social_alliance_breaks (ends_at);
      CREATE TABLE IF NOT EXISTS social_completed_alliance_breaks (
        pair_key TEXT PRIMARY KEY,
        player_a_id TEXT NOT NULL,
        player_b_id TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        ends_at INTEGER NOT NULL,
        finalized_at INTEGER NOT NULL,
        notification_expires_at INTEGER NOT NULL,
        created_by_player_id TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS social_completed_alliance_breaks_expires_idx ON social_completed_alliance_breaks (notification_expires_at);
      CREATE TABLE IF NOT EXISTS social_truce_requests (
        id TEXT PRIMARY KEY,
        from_player_id TEXT NOT NULL,
        to_player_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        duration_hours INTEGER NOT NULL,
        from_name TEXT,
        to_name TEXT
      );
      CREATE INDEX IF NOT EXISTS social_truce_requests_expires_idx ON social_truce_requests (expires_at);
      CREATE TABLE IF NOT EXISTS social_active_truces (
        pair_key TEXT PRIMARY KEY,
        player_a_id TEXT NOT NULL,
        player_b_id TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        ends_at INTEGER NOT NULL,
        created_by_player_id TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS social_active_truces_ends_idx ON social_active_truces (ends_at);
      CREATE TABLE IF NOT EXISTS social_truce_lockouts (
        player_id TEXT PRIMARY KEY,
        lockout_until INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS social_truce_lockouts_until_idx ON social_truce_lockouts (lockout_until);
      CREATE TABLE IF NOT EXISTS social_truce_breaks (
        player_id TEXT NOT NULL,
        target_player_id TEXT NOT NULL,
        target_player_name TEXT NOT NULL,
        broken_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS social_truce_breaks_player_idx ON social_truce_breaks (player_id);
    `);
  }

  loadSnapshot(): SocialStoreSnapshot {
    const playerRows = this.db.prepare(`SELECT player_id, name, updated_at FROM social_players`).all() as PlayerRow[];
    const allianceRows = this.db
      .prepare(`SELECT player_a_id, player_b_id, created_at FROM social_alliances`)
      .all() as AllianceRow[];
    const allianceRequestRows = this.db
      .prepare(
        `SELECT id, from_player_id, to_player_id, created_at, from_name, to_name FROM social_alliance_requests`
      )
      .all() as AllianceRequestRow[];
    const allianceBreakRows = this.db
      .prepare(
        `SELECT pair_key, player_a_id, player_b_id, started_at, ends_at, created_by_player_id FROM social_alliance_breaks`
      )
      .all() as AllianceBreakRow[];
    const completedAllianceBreakRows = this.db
      .prepare(
        `SELECT pair_key, player_a_id, player_b_id, started_at, ends_at, finalized_at, notification_expires_at, created_by_player_id FROM social_completed_alliance_breaks`
      )
      .all() as CompletedAllianceBreakRow[];
    const truceRequestRows = this.db
      .prepare(
        `SELECT id, from_player_id, to_player_id, created_at, expires_at, duration_hours, from_name, to_name FROM social_truce_requests`
      )
      .all() as TruceRequestRow[];
    const activeTruceRows = this.db
      .prepare(
        `SELECT pair_key, player_a_id, player_b_id, started_at, ends_at, created_by_player_id FROM social_active_truces`
      )
      .all() as ActiveTruceRow[];
    const truceLockoutRows = this.db
      .prepare(`SELECT player_id, lockout_until FROM social_truce_lockouts`)
      .all() as TruceLockoutRow[];
    const truceBreakRows = this.db
      .prepare(`SELECT player_id, target_player_id, target_player_name, broken_at FROM social_truce_breaks`)
      .all() as TruceBreakRow[];

    const alliesByPlayer = new Map<string, Set<string>>();
    for (const row of allianceRows) {
      if (!alliesByPlayer.has(row.player_a_id)) alliesByPlayer.set(row.player_a_id, new Set());
      if (!alliesByPlayer.has(row.player_b_id)) alliesByPlayer.set(row.player_b_id, new Set());
      alliesByPlayer.get(row.player_a_id)!.add(row.player_b_id);
      alliesByPlayer.get(row.player_b_id)!.add(row.player_a_id);
    }

    return {
      players: playerRows.map((row) => ({
        id: row.player_id,
        name: row.name,
        allies: [...(alliesByPlayer.get(row.player_id) ?? [])]
      })),
      allianceRecords: allianceRows.map((row) => ({ playerAId: row.player_a_id, playerBId: row.player_b_id, createdAt: row.created_at })),
      allianceRequests: allianceRequestRows.map(allianceRequestFromRow),
      activeAllianceBreaks: allianceBreakRows.map(allianceBreakFromRow),
      completedAllianceBreaks: completedAllianceBreakRows.map(completedAllianceBreakFromRow),
      truceRequests: truceRequestRows.map(truceRequestFromRow),
      activeTruces: activeTruceRows.map(activeTruceFromRow),
      truceLockouts: truceLockoutRows.map((row) => ({ playerId: row.player_id, lockoutUntil: row.lockout_until })),
      truceBreaks: truceBreakRows.map((row) => ({
        playerId: row.player_id,
        targetPlayerId: row.target_player_id,
        targetPlayerName: row.target_player_name,
        brokenAt: row.broken_at
      }))
    };
  }

  upsertPlayer(playerId: string, name: string): void {
    this.db
      .prepare(
        `INSERT INTO social_players (player_id, name, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(player_id) DO UPDATE SET
           name = excluded.name,
           updated_at = excluded.updated_at`
      )
      .run(playerId, name, this.now());
  }

  saveAllianceRequest(request: SocialAllianceRequest): void {
    this.db
      .prepare(
        `INSERT INTO social_alliance_requests (id, from_player_id, to_player_id, created_at, from_name, to_name)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           from_player_id = excluded.from_player_id,
           to_player_id = excluded.to_player_id,
           created_at = excluded.created_at,
           from_name = excluded.from_name,
           to_name = excluded.to_name`
      )
      .run(
        request.id,
        request.fromPlayerId,
        request.toPlayerId,
        request.createdAt,
        request.fromName ?? null,
        request.toName ?? null
      );
  }

  deleteAllianceRequest(requestId: string): void {
    this.db.prepare(`DELETE FROM social_alliance_requests WHERE id = ?`).run(requestId);
  }

  saveAllianceBreak(notice: SocialAllianceBreak): void {
    this.db
      .prepare(
        `INSERT INTO social_alliance_breaks (pair_key, player_a_id, player_b_id, started_at, ends_at, created_by_player_id)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(pair_key) DO UPDATE SET
           player_a_id = excluded.player_a_id,
           player_b_id = excluded.player_b_id,
           started_at = excluded.started_at,
           ends_at = excluded.ends_at,
           created_by_player_id = excluded.created_by_player_id`
      )
      .run(
        pairKey(notice.playerAId, notice.playerBId),
        notice.playerAId,
        notice.playerBId,
        notice.startedAt,
        notice.endsAt,
        notice.createdByPlayerId
      );
  }

  removeAllianceBreak(playerAId: string, playerBId: string): void {
    this.db.prepare(`DELETE FROM social_alliance_breaks WHERE pair_key = ?`).run(pairKey(playerAId, playerBId));
  }

  saveCompletedAllianceBreak(notice: SocialCompletedAllianceBreak): void {
    this.db
      .prepare(
        `INSERT INTO social_completed_alliance_breaks (
           pair_key, player_a_id, player_b_id, started_at, ends_at, finalized_at, notification_expires_at, created_by_player_id
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(pair_key) DO UPDATE SET
           player_a_id = excluded.player_a_id,
           player_b_id = excluded.player_b_id,
           started_at = excluded.started_at,
           ends_at = excluded.ends_at,
           finalized_at = excluded.finalized_at,
           notification_expires_at = excluded.notification_expires_at,
           created_by_player_id = excluded.created_by_player_id`
      )
      .run(
        pairKey(notice.playerAId, notice.playerBId),
        notice.playerAId,
        notice.playerBId,
        notice.startedAt,
        notice.endsAt,
        notice.finalizedAt,
        notice.notificationExpiresAt,
        notice.createdByPlayerId
      );
  }

  removeCompletedAllianceBreak(playerAId: string, playerBId: string): void {
    this.db.prepare(`DELETE FROM social_completed_alliance_breaks WHERE pair_key = ?`).run(pairKey(playerAId, playerBId));
  }

  saveTruceRequest(request: SocialTruceRequest): void {
    this.db
      .prepare(
        `INSERT INTO social_truce_requests (id, from_player_id, to_player_id, created_at, expires_at, duration_hours, from_name, to_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           from_player_id = excluded.from_player_id,
           to_player_id = excluded.to_player_id,
           created_at = excluded.created_at,
           expires_at = excluded.expires_at,
           duration_hours = excluded.duration_hours,
           from_name = excluded.from_name,
           to_name = excluded.to_name`
      )
      .run(
        request.id,
        request.fromPlayerId,
        request.toPlayerId,
        request.createdAt,
        request.expiresAt,
        request.durationHours,
        request.fromName ?? null,
        request.toName ?? null
      );
  }

  deleteTruceRequest(requestId: string): void {
    this.db.prepare(`DELETE FROM social_truce_requests WHERE id = ?`).run(requestId);
  }

  addAlliance(playerAId: string, playerBId: string, createdAt: number): void {
    const [aId, bId] = orderedPair(playerAId, playerBId);
    this.db
      .prepare(
        `INSERT INTO social_alliances (player_a_id, player_b_id, created_at)
         VALUES (?, ?, ?)
         ON CONFLICT(player_a_id, player_b_id) DO UPDATE SET created_at = excluded.created_at`
      )
      .run(aId, bId, createdAt);
  }

  removeAlliance(playerAId: string, playerBId: string): void {
    const [aId, bId] = orderedPair(playerAId, playerBId);
    this.db.prepare(`DELETE FROM social_alliances WHERE player_a_id = ? AND player_b_id = ?`).run(aId, bId);
  }

  saveActiveTruce(truce: SocialActiveTruce): void {
    this.db
      .prepare(
        `INSERT INTO social_active_truces (pair_key, player_a_id, player_b_id, started_at, ends_at, created_by_player_id)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(pair_key) DO UPDATE SET
           player_a_id = excluded.player_a_id,
           player_b_id = excluded.player_b_id,
           started_at = excluded.started_at,
           ends_at = excluded.ends_at,
           created_by_player_id = excluded.created_by_player_id`
      )
      .run(
        pairKey(truce.playerAId, truce.playerBId),
        truce.playerAId,
        truce.playerBId,
        truce.startedAt,
        truce.endsAt,
        truce.createdByPlayerId
      );
  }

  removeActiveTruce(playerAId: string, playerBId: string): void {
    this.db.prepare(`DELETE FROM social_active_truces WHERE pair_key = ?`).run(pairKey(playerAId, playerBId));
  }

  saveTruceLockout(playerId: string, lockoutUntil: number): void {
    this.db
      .prepare(
        `INSERT INTO social_truce_lockouts (player_id, lockout_until)
         VALUES (?, ?)
         ON CONFLICT(player_id) DO UPDATE SET lockout_until = excluded.lockout_until`
      )
      .run(playerId, lockoutUntil);
  }

  saveTruceBreak(playerId: string, record: SocialTruceBreakRecord): void {
    this.db
      .prepare(
        `INSERT INTO social_truce_breaks (player_id, target_player_id, target_player_name, broken_at)
         VALUES (?, ?, ?, ?)`
      )
      .run(playerId, record.targetPlayerId, record.targetPlayerName, record.brokenAt);
    // Keep only the most recent MAX_TRUCE_BREAKS_PER_PLAYER rows for this player --
    // this is a season-long, otherwise unbounded table (state-and-persistence-discipline.md).
    this.db
      .prepare(
        `DELETE FROM social_truce_breaks
         WHERE player_id = ? AND rowid NOT IN (
           SELECT rowid FROM social_truce_breaks WHERE player_id = ? ORDER BY broken_at DESC LIMIT ?
         )`
      )
      .run(playerId, playerId, MAX_TRUCE_BREAKS_PER_PLAYER);
  }

  pruneExpired(now: number): void {
    this.db.prepare(`DELETE FROM social_truce_requests WHERE expires_at <= ?`).run(now);
    this.db.prepare(`DELETE FROM social_active_truces WHERE ends_at <= ?`).run(now);
    this.db.prepare(`DELETE FROM social_completed_alliance_breaks WHERE notification_expires_at <= ?`).run(now);
    this.db.prepare(`DELETE FROM social_truce_lockouts WHERE lockout_until <= ?`).run(now);
  }

  clearSeasonData(): void {
    this.db.exec(`DELETE FROM social_alliances`);
    this.db.exec(`DELETE FROM social_alliance_requests`);
    this.db.exec(`DELETE FROM social_alliance_breaks`);
    this.db.exec(`DELETE FROM social_completed_alliance_breaks`);
    this.db.exec(`DELETE FROM social_truce_requests`);
    this.db.exec(`DELETE FROM social_active_truces`);
    this.db.exec(`DELETE FROM social_truce_lockouts`);
    this.db.exec(`DELETE FROM social_truce_breaks`);
  }
}
