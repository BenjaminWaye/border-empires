import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";
import { applyPlayerMessageToSnapshot } from "../subscription-snapshot-cache/subscription-snapshot-cache.js";

// Per-player SubscribePlayer snapshot cache, stamped with the world revision
// its tiles were current as of.
//
// The cache exists so the gateway's bootstrap retry loop (3-4 RPCs while the
// first build runs) and a quick reconnect don't each pay a fresh snapshot
// build. It is kept up to date only for players the fanout still considers
// subscribed (see the TILE_DELTA_BATCH handler in simulation-service.ts), so
// any tile change that lands while a player is unsubscribed never reaches
// their entry.
//
// That used to be silently served back as the authoritative INIT on the next
// login: buildInitMessage does no server-side tile replay (recovery only
// carries nextClientSeq + pendingCommands), so tiles missing from the cached
// snapshot stayed missing on the client until some later event happened to
// touch them again — reported in the wild as an outpost's vision disc never
// revealing.
//
// The revision stamp turns that into a read-time check instead of an attempt
// to enumerate every way an entry can go stale. `worldRevision` advances on
// every tile-delta batch; `getCurrent` only returns an entry still stamped at
// the current revision, so a snapshot that missed a batch is rebuilt rather
// than served. It closes the unsubscribed-player path and the bootstrap-only
// paths (rally-anchor lookups cache a snapshot for a player who never
// subscribes and so never unsubscribes) with one rule.
type CacheEntry = {
  snapshot: PlayerSubscriptionSnapshot;
  revision: number;
};

export type PlayerSnapshotCache = {
  /** The current world revision. Advances once per applied tile-delta batch. */
  worldRevision: () => number;
  /** Advance the world revision. Call once per tile-delta batch, before fanout. */
  bumpWorldRevision: () => number;
  /** Entries for metric summarisation; includes stale ones (they still cost memory). */
  entries: () => Iterable<[string, PlayerSubscriptionSnapshot]>;
  /**
   * The cached snapshot regardless of staleness. For readers that only want
   * revision-independent fields (player economy/upkeep) or that are about to
   * overwrite the entry wholesale.
   */
  peek: (playerId: string) => PlayerSubscriptionSnapshot | undefined;
  /**
   * The cached snapshot only if its tiles are current. Every path that serves a
   * cached snapshot back to a client as authoritative state must use this.
   */
  getCurrent: (playerId: string) => PlayerSubscriptionSnapshot | undefined;
  /**
   * Store a freshly built snapshot. Stamped at the current revision unless
   * `atRevision` is given — an async build must pass the revision it started
   * from, since a batch that lands mid-build may not be reflected in the
   * exported state and would otherwise be stamped as though it were.
   */
  set: (playerId: string, snapshot: PlayerSubscriptionSnapshot, atRevision?: number) => void;
  /**
   * Replace the snapshot while keeping its existing stamp — for updates that
   * carry no tile state (leaderboard, tech, domain). Re-stamping here would
   * mark an offline player's stale tiles as current.
   */
  update: (playerId: string, snapshot: PlayerSubscriptionSnapshot) => void;
  /**
   * Re-stamp an entry at the current revision, for a subscribed player whose
   * filtered delta set for this batch was empty — nothing they can see changed,
   * so their snapshot is still current.
   */
  markCurrent: (playerId: string) => void;
  delete: (playerId: string) => void;
  clear: () => void;
  /** How many times a stale entry was rejected by getCurrent (metrics/logging). */
  staleReadCount: () => number;
};

export const createPlayerSnapshotCache = (): PlayerSnapshotCache => {
  const entriesByPlayerId = new Map<string, CacheEntry>();
  let revision = 0;
  let staleReads = 0;

  return {
    worldRevision: () => revision,
    bumpWorldRevision: () => (revision += 1),
    *entries() {
      for (const [playerId, entry] of entriesByPlayerId) yield [playerId, entry.snapshot];
    },
    peek: (playerId) => entriesByPlayerId.get(playerId)?.snapshot,
    getCurrent: (playerId) => {
      const entry = entriesByPlayerId.get(playerId);
      if (!entry) return undefined;
      if (entry.revision !== revision) {
        staleReads += 1;
        return undefined;
      }
      return entry.snapshot;
    },
    set: (playerId, snapshot, atRevision) => {
      entriesByPlayerId.set(playerId, { snapshot, revision: atRevision ?? revision });
    },
    update: (playerId, snapshot) => {
      const entry = entriesByPlayerId.get(playerId);
      if (!entry) return;
      entriesByPlayerId.set(playerId, { snapshot, revision: entry.revision });
    },
    markCurrent: (playerId) => {
      const entry = entriesByPlayerId.get(playerId);
      if (!entry) return;
      entry.revision = revision;
    },
    delete: (playerId) => {
      entriesByPlayerId.delete(playerId);
    },
    clear: () => {
      entriesByPlayerId.clear();
    },
    staleReadCount: () => staleReads
  };
};

/**
 * Cache maintenance for the events that carry no tile state: PLAYER_MESSAGE
 * (leaderboard/economy/social), TECH_UPDATE and DOMAIN_UPDATE. These refresh
 * the cached snapshot in place but must NOT advance its revision stamp — a
 * player can receive these while unsubscribed, and re-stamping would mark
 * their stale tiles as current and reintroduce the stale-INIT bug.
 *
 * Returns whether an entry was updated, so the caller can refresh cache metrics.
 */
export const applyNonTileEventToCache = (
  cache: PlayerSnapshotCache,
  eventType: "PLAYER_MESSAGE" | "TECH_UPDATE" | "DOMAIN_UPDATE",
  playerId: string,
  payloadJson: string | undefined
): boolean => {
  const payload = payloadJson ? (JSON.parse(payloadJson) as Record<string, unknown>) : undefined;
  if (!payload) return false;
  const cachedSnapshot = cache.peek(playerId);
  if (!cachedSnapshot) return false;
  const message = eventType === "PLAYER_MESSAGE" ? payload : { type: eventType, ...payload };
  cache.update(playerId, applyPlayerMessageToSnapshot(cachedSnapshot, message));
  return true;
};
