import type { DatabaseSync } from "node:sqlite";

import type { SocialActiveTruce, SocialAllianceRequest, SocialTruceRequest } from "./social-state.js";

export type SocialStoreSnapshot = {
  players: Array<{ id: string; name: string; allies: string[] }>;
  allianceRequests: SocialAllianceRequest[];
  truceRequests: SocialTruceRequest[];
  activeTruces: SocialActiveTruce[];
};

export type GatewaySocialStore = {
  loadSnapshot(): SocialStoreSnapshot;
  upsertPlayer(playerId: string, name: string): void;
  saveAllianceRequest(request: SocialAllianceRequest): void;
  deleteAllianceRequest(requestId: string): void;
  saveTruceRequest(request: SocialTruceRequest): void;
  deleteTruceRequest(requestId: string): void;
  addAlliance(playerAId: string, playerBId: string, createdAt: number): void;
  removeAlliance(playerAId: string, playerBId: string): void;
  saveActiveTruce(truce: SocialActiveTruce): void;
  removeActiveTruce(playerAId: string, playerBId: string): void;
  pruneExpired(now: number): void;
};

const orderedPair = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a]);

export const pairKey = (a: string, b: string): string => {
  const [first, second] = orderedPair(a, b);
  return `${first}:${second}`;
};

export class InMemoryGatewaySocialStore implements GatewaySocialStore {
  private readonly players = new Map<string, { name: string; updatedAt: number }>();
  private readonly alliances = new Map<string, { aId: string; bId: string; createdAt: number }>();
  private readonly allianceRequests = new Map<string, SocialAllianceRequest>();
  private readonly truceRequests = new Map<string, SocialTruceRequest>();
  private readonly activeTruces = new Map<string, SocialActiveTruce>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  loadSnapshot(): SocialStoreSnapshot {
    const alliesByPlayer = new Map<string, Set<string>>();
    for (const entry of this.alliances.values()) {
      if (!alliesByPlayer.has(entry.aId)) alliesByPlayer.set(entry.aId, new Set());
      if (!alliesByPlayer.has(entry.bId)) alliesByPlayer.set(entry.bId, new Set());
      alliesByPlayer.get(entry.aId)!.add(entry.bId);
      alliesByPlayer.get(entry.bId)!.add(entry.aId);
    }
    return {
      players: [...this.players.entries()].map(([id, { name }]) => ({
        id,
        name,
        allies: [...(alliesByPlayer.get(id) ?? [])]
      })),
      allianceRequests: [...this.allianceRequests.values()].map((r) => ({ ...r })),
      truceRequests: [...this.truceRequests.values()].map((r) => ({ ...r })),
      activeTruces: [...this.activeTruces.values()].map((t) => ({ ...t }))
    };
  }

  upsertPlayer(playerId: string, name: string): void {
    this.players.set(playerId, { name, updatedAt: this.now() });
  }

  saveAllianceRequest(request: SocialAllianceRequest): void {
    this.allianceRequests.set(request.id, { ...request });
  }

  deleteAllianceRequest(requestId: string): void {
    this.allianceRequests.delete(requestId);
  }

  saveTruceRequest(request: SocialTruceRequest): void {
    this.truceRequests.set(request.id, { ...request });
  }

  deleteTruceRequest(requestId: string): void {
    this.truceRequests.delete(requestId);
  }

  addAlliance(playerAId: string, playerBId: string, createdAt: number): void {
    const [aId, bId] = orderedPair(playerAId, playerBId);
    this.alliances.set(pairKey(aId, bId), { aId, bId, createdAt });
  }

  removeAlliance(playerAId: string, playerBId: string): void {
    this.alliances.delete(pairKey(playerAId, playerBId));
  }

  saveActiveTruce(truce: SocialActiveTruce): void {
    this.activeTruces.set(pairKey(truce.playerAId, truce.playerBId), { ...truce });
  }

  removeActiveTruce(playerAId: string, playerBId: string): void {
    this.activeTruces.delete(pairKey(playerAId, playerBId));
  }

  pruneExpired(now: number): void {
    for (const [id, request] of this.truceRequests) {
      if (request.expiresAt <= now) this.truceRequests.delete(id);
    }
    for (const [key, truce] of this.activeTruces) {
      if (truce.endsAt <= now) this.activeTruces.delete(key);
    }
  }
}

type PlayerRow = { player_id: string; name: string; updated_at: number };
type AllianceRow = { player_a_id: string; player_b_id: string; created_at: number };
type AllianceRequestRow = {
  id: string;
  from_player_id: string;
  to_player_id: string;
  created_at: number;
  from_name: string | null;
  to_name: string | null;
};
type TruceRequestRow = {
  id: string;
  from_player_id: string;
  to_player_id: string;
  created_at: number;
  expires_at: number;
  duration_hours: number;
  from_name: string | null;
  to_name: string | null;
};
type ActiveTruceRow = {
  pair_key: string;
  player_a_id: string;
  player_b_id: string;
  started_at: number;
  ends_at: number;
  created_by_player_id: string;
};

const allianceRequestFromRow = (row: AllianceRequestRow): SocialAllianceRequest => ({
  id: row.id,
  fromPlayerId: row.from_player_id,
  toPlayerId: row.to_player_id,
  createdAt: row.created_at,
  ...(row.from_name ? { fromName: row.from_name } : {}),
  ...(row.to_name ? { toName: row.to_name } : {})
});

const truceRequestFromRow = (row: TruceRequestRow): SocialTruceRequest => ({
  id: row.id,
  fromPlayerId: row.from_player_id,
  toPlayerId: row.to_player_id,
  createdAt: row.created_at,
  expiresAt: row.expires_at,
  durationHours: row.duration_hours as 12 | 24,
  ...(row.from_name ? { fromName: row.from_name } : {}),
  ...(row.to_name ? { toName: row.to_name } : {})
});

const activeTruceFromRow = (row: ActiveTruceRow): SocialActiveTruce => ({
  playerAId: row.player_a_id,
  playerBId: row.player_b_id,
  startedAt: row.started_at,
  endsAt: row.ends_at,
  createdByPlayerId: row.created_by_player_id
});

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
      allianceRequests: allianceRequestRows.map(allianceRequestFromRow),
      truceRequests: truceRequestRows.map(truceRequestFromRow),
      activeTruces: activeTruceRows.map(activeTruceFromRow)
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

  pruneExpired(now: number): void {
    this.db.prepare(`DELETE FROM social_truce_requests WHERE expires_at <= ?`).run(now);
    this.db.prepare(`DELETE FROM social_active_truces WHERE ends_at <= ?`).run(now);
  }
}
