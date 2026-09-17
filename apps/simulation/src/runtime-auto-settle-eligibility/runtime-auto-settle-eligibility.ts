// Event-driven replacement for AutoSettlementQueueCache (removed in the same
// branch as this module). See docs/agents plan "eager-twirling-riddle" for
// the full design writeup and the 2026-09-17 prod CPU-throttle incident this
// fixes.
//
// The old design periodically rebuilt a player's whole auto-settlement
// candidate list by scanning every FRONTIER tile they own, including an
// O(world) town-support ring scan per tile. This module instead maintains a
// small, bounded, server-held queue per player (eligibleFrontierByOwner) that
// is updated at the handful of discrete write sites that can actually change
// a tile's eligibility (see the hook call sites in runtime.ts,
// runtime-progression-command-handlers.ts, and runtime-lock-resolution.ts).
//
// Rule 6 (plain support tiles) used to require an 8-neighbor (or wider)
// per-tile scan via hasTownSupport -> assignedTownKeyForSupportTile ->
// wideSupportRingScanRadiusFor. That is replaced here by
// grownTownSupportRingByOwner, a per-player index of "which tile keys sit
// inside the support ring of one of this player's TOWN+ tier towns" -- an
// O(1) Set/Map lookup maintained incrementally by
// syncTownSupportRingForTileChange instead of a scan.
import type { DomainTileState } from "@border-empires/game-domain";
import { simulationTileKey } from "../seed-state/seed-state.js";
import { supportRingCandidates, supportRingRadiusForTier } from "@border-empires/shared";
import { isAutoSettlementEligibleTarget } from "../territory-automation/territory-automation.js";

/** Bounded per-player cap -- see the module doc comment and the plan's Design §1. */
export const AUTO_SETTLE_ELIGIBLE_FRONTIER_CAP_PER_PLAYER = 20;

export type EligibleFrontierByOwner = Map<string, Set<string>>;

/**
 * Per-player union of "tile keys inside the support ring of one of this
 * player's TOWN+ tier towns" -- refcounted (not a plain Set) because two
 * towns' rings can overlap: removing one town's ring must not evict a tile
 * that's still covered by another town's ring.
 */
export type GrownTownSupportRingByOwner = Map<string, Map<string, number>>;

// ---------------------------------------------------------------------------
// eligibleFrontierByOwner: bounded insertion-ordered queue
// ---------------------------------------------------------------------------

export const eligibleFrontierCountForOwner = (map: EligibleFrontierByOwner, ownerId: string): number =>
  map.get(ownerId)?.size ?? 0;

export const isFrontierTileQueued = (map: EligibleFrontierByOwner, ownerId: string, tileKey: string): boolean =>
  Boolean(map.get(ownerId)?.has(tileKey));

/** Inserts tileKey into ownerId's bounded queue. Drops silently at cap. Returns true if inserted. */
export const insertEligibleFrontierTile = (map: EligibleFrontierByOwner, ownerId: string, tileKey: string): boolean => {
  let set = map.get(ownerId);
  if (!set) {
    set = new Set<string>();
    map.set(ownerId, set);
  }
  if (set.has(tileKey)) return false;
  if (set.size >= AUTO_SETTLE_ELIGIBLE_FRONTIER_CAP_PER_PLAYER) return false;
  set.add(tileKey);
  return true;
};

export const removeEligibleFrontierTile = (map: EligibleFrontierByOwner, ownerId: string, tileKey: string): void => {
  map.get(ownerId)?.delete(tileKey);
};

export const forgetEligibleFrontierOwner = (map: EligibleFrontierByOwner, ownerId: string): void => {
  map.delete(ownerId);
};

/** Insertion-ordered snapshot of a player's queued eligible frontier tiles, as {x, y} (for autoSettlementQueueForPlayer). */
export const orderedEligibleFrontierTiles = (map: EligibleFrontierByOwner, ownerId: string): Array<{ x: number; y: number }> => {
  const set = map.get(ownerId);
  if (!set) return [];
  const output: Array<{ x: number; y: number }> = [];
  for (const tileKey of set) {
    const [rawX, rawY] = tileKey.split(",");
    const x = Number(rawX);
    const y = Number(rawY);
    if (Number.isFinite(x) && Number.isFinite(y)) output.push({ x, y });
  }
  return output;
};

/** Pops (removes and returns) the earliest-inserted queued tile key, or undefined if empty. */
export const popNextEligibleFrontierTile = (map: EligibleFrontierByOwner, ownerId: string): string | undefined => {
  const set = map.get(ownerId);
  if (!set || set.size === 0) return undefined;
  const tileKey = set.values().next().value as string;
  set.delete(tileKey);
  return tileKey;
};

// ---------------------------------------------------------------------------
// grownTownSupportRingByOwner: refcounted per-owner ring index
// ---------------------------------------------------------------------------

export const hasGrownTownSupportRing = (map: GrownTownSupportRingByOwner, ownerId: string, tileKey: string): boolean =>
  (map.get(ownerId)?.get(tileKey) ?? 0) > 0;

const addRingRef = (map: GrownTownSupportRingByOwner, ownerId: string, tileKey: string): boolean => {
  let owned = map.get(ownerId);
  if (!owned) {
    owned = new Map<string, number>();
    map.set(ownerId, owned);
  }
  const count = owned.get(tileKey) ?? 0;
  owned.set(tileKey, count + 1);
  return count === 0; // true when this tile just became covered
};

const removeRingRef = (map: GrownTownSupportRingByOwner, ownerId: string, tileKey: string): void => {
  const owned = map.get(ownerId);
  if (!owned) return;
  const count = owned.get(tileKey) ?? 0;
  if (count <= 1) owned.delete(tileKey);
  else owned.set(tileKey, count - 1);
};

/** A TOWN+ tier town's own support-ring radius, or undefined when `tile` isn't a settled, owned, TOWN+ tier town. */
const ringRadiusForOwnedTownTile = (tile: DomainTileState | undefined, ownerId: string | undefined): number | undefined => {
  if (!tile || !ownerId || tile.ownerId !== ownerId) return undefined;
  if (tile.ownershipState !== "SETTLED" || !tile.town) return undefined;
  if (tile.town.populationTier === "SETTLEMENT") return undefined;
  return supportRingRadiusForTier(tile.town.populationTier);
};

const ringTileKeysAround = (tiles: ReadonlyMap<string, DomainTileState>, x: number, y: number, radius: number): string[] =>
  supportRingCandidates(tiles, x, y, radius).map(({ tile }) => simulationTileKey(tile.x, tile.y));

/**
 * Maintains grownTownSupportRingByOwner for a single tile mutation (town tier
 * upgrade, town capture, or a town tile otherwise losing its town-ness or
 * owner). Returns, per affected owner, the tile keys that newly became
 * ring-covered by that owner's ring -- callers should evaluate/attempt-settle
 * those keys (they may now satisfy rule 6, isAutoSettlementEligibleTarget's
 * plain-support-tile branch).
 *
 * Safe to call for every replaceTileState/setTileState mutation: it's a
 * no-op (cheap radius/owner comparison, no ring scan) unless `previous` or
 * `next` is itself a TOWN+ tier settled town tile.
 */
export const syncTownSupportRingForTileChange = (input: {
  tileKey: string;
  previous: DomainTileState | undefined;
  next: DomainTileState;
  tiles: ReadonlyMap<string, DomainTileState>;
  grownTownSupportRingByOwner: GrownTownSupportRingByOwner;
}): Array<{ ownerId: string; newlyCoveredTileKeys: string[] }> => {
  const prevOwnerId = input.previous?.ownerId;
  const nextOwnerId = input.next.ownerId;
  const prevRadius = ringRadiusForOwnedTownTile(input.previous, prevOwnerId);
  const nextRadius = ringRadiusForOwnedTownTile(input.next, nextOwnerId);
  if (prevRadius === undefined && nextRadius === undefined) return [];
  if (prevRadius === nextRadius && prevOwnerId === nextOwnerId) return []; // unchanged town, unchanged tier/owner

  const results: Array<{ ownerId: string; newlyCoveredTileKeys: string[] }> = [];

  if (prevRadius !== undefined && prevOwnerId) {
    const prevKeys = ringTileKeysAround(input.tiles, input.previous!.x, input.previous!.y, prevRadius);
    for (const key of prevKeys) removeRingRef(input.grownTownSupportRingByOwner, prevOwnerId, key);
  }
  if (nextRadius !== undefined && nextOwnerId) {
    const nextKeys = ringTileKeysAround(input.tiles, input.next.x, input.next.y, nextRadius);
    const newlyCoveredTileKeys = nextKeys.filter((key) => addRingRef(input.grownTownSupportRingByOwner, nextOwnerId, key));
    if (newlyCoveredTileKeys.length > 0) results.push({ ownerId: nextOwnerId, newlyCoveredTileKeys });
  }
  return results;
};

/**
 * Cheap, bounded reconciliation safety net (Design §6/plan Open Items):
 * hooks should keep eligibleFrontierByOwner correct at every real trigger,
 * but population-growth tile writes bypass replaceTileState entirely (see
 * runtime-population-growth.ts), and any future direct-write path could too.
 * Rather than a periodic full O(frontier) sweep, this only scans when a
 * player's queue is completely empty -- the one cheap, unambiguous signal
 * that something might have been missed (a correctly-hooked player with any
 * eligible tile always has at least one queued entry) -- and even then caps
 * the scan at `scanBudget` frontier tiles, not the whole frontier. Intended
 * to be called once per player per territory-automation tick (~30s), so a
 * missed hook self-heals within a bounded number of tiles per tick rather
 * than a full-frontier rescan.
 */
export const RECONCILE_SCAN_BUDGET = 50;

export const reconcileEligibleFrontierQueueForOwner = (
  eligibleFrontierByOwner: EligibleFrontierByOwner,
  ownerId: string,
  frontierTileKeys: Iterable<string>,
  deps: EvaluateTileEligibilityDeps,
  scanBudget = RECONCILE_SCAN_BUDGET
): number => {
  if (eligibleFrontierCountForOwner(eligibleFrontierByOwner, ownerId) > 0) return 0;
  let scanned = 0;
  let inserted = 0;
  for (const tileKey of frontierTileKeys) {
    if (scanned >= scanBudget) break;
    scanned += 1;
    if (evaluateTileEligibility(tileKey, ownerId, deps) && insertEligibleFrontierTile(eligibleFrontierByOwner, ownerId, tileKey)) {
      inserted += 1;
    }
  }
  return inserted;
};

/**
 * Boot/hydration-only seeding: like frontierTilesByOwner, neither of this
 * module's maps is included in the persisted snapshot (see the plan's
 * Storage location note) -- both are fully re-derivable from tile state, so
 * a cold rebuild here at boot is the simpler, always-correct choice instead
 * of carrying a second source of truth across restarts. Only called once,
 * per tile, during the same boot loop that seeds frontierTilesByOwner.
 */
export const seedGrownTownSupportRingForTownTile = (
  map: GrownTownSupportRingByOwner,
  tile: DomainTileState,
  tiles: ReadonlyMap<string, DomainTileState>
): void => {
  const radius = ringRadiusForOwnedTownTile(tile, tile.ownerId);
  if (radius === undefined || !tile.ownerId) return;
  for (const key of ringTileKeysAround(tiles, tile.x, tile.y, radius)) addRingRef(map, tile.ownerId, key);
};

/** Boot/hydration-only seeding for eligibleFrontierByOwner -- see seedGrownTownSupportRingForTownTile's doc comment. */
export const seedEligibleFrontierQueueForOwner = (
  eligibleFrontierByOwner: EligibleFrontierByOwner,
  ownerId: string,
  frontierTileKeys: Iterable<string>,
  deps: EvaluateTileEligibilityDeps
): void => {
  for (const tileKey of frontierTileKeys) {
    if (eligibleFrontierCountForOwner(eligibleFrontierByOwner, ownerId) >= AUTO_SETTLE_ELIGIBLE_FRONTIER_CAP_PER_PLAYER) break;
    if (evaluateTileEligibility(tileKey, ownerId, deps)) insertEligibleFrontierTile(eligibleFrontierByOwner, ownerId, tileKey);
  }
};

// ---------------------------------------------------------------------------
// Eligibility evaluation (rules 1-6, minus the redundant vision check -- see
// the plan's rule-5 finding: fog is always true for owned FRONTIER tiles).
// ---------------------------------------------------------------------------

export type EvaluateTileEligibilityDeps = {
  getTile: (tileKey: string) => DomainTileState | undefined;
  isBlocked: (tileKey: string) => boolean;
  isInReach: (tile: DomainTileState) => boolean;
  isRevealedToPlayer: (tile: DomainTileState) => boolean;
  hasTownSupport: (tile: DomainTileState) => boolean;
};

export const evaluateTileEligibility = (tileKey: string, playerId: string, deps: EvaluateTileEligibilityDeps): boolean => {
  if (deps.isBlocked(tileKey)) return false;
  const tile = deps.getTile(tileKey);
  return isAutoSettlementEligibleTarget(tile, playerId, deps.hasTownSupport, deps.isRevealedToPlayer, deps.isInReach);
};

// ---------------------------------------------------------------------------
// Immediate-settle / drain
// ---------------------------------------------------------------------------

export type SettleAttemptContext = {
  getTile: (tileKey: string) => DomainTileState | undefined;
  isBlocked: (tileKey: string) => boolean;
  isInReach: (playerId: string, tile: DomainTileState) => boolean;
  settleRejectionForActor: (playerId: string) => boolean;
  hasAvailableDevelopmentSlot: (playerId: string) => boolean;
  startSettlementProcess: (input: {
    commandId: string;
    playerId: string;
    targetKey: string;
    target: DomainTileState;
    startedAt: number;
  }) => void;
  nextCommandId: (playerId: string, tileKey: string) => string;
  now: () => number;
};

/**
 * Re-validates the exact same gates runAutoSettleForPlayer's loop body always
 * applied (frontier ownership, encirclement decay, terrain, blocked/pending,
 * reach), and either starts settlement immediately (dev slot free) or queues
 * the tile for later (bounded insert, silently dropped past the cap).
 */
export const attemptImmediateSettle = (
  eligibleFrontierByOwner: EligibleFrontierByOwner,
  ownerId: string,
  tileKey: string,
  ctx: SettleAttemptContext
): void => {
  const target = ctx.getTile(tileKey);
  if (!target || target.ownerId !== ownerId || target.ownershipState !== "FRONTIER") return;
  if (target.frontierDecayKind === "ENCIRCLEMENT") return;
  if (target.terrain !== "LAND") return;
  if (ctx.isBlocked(tileKey)) {
    insertEligibleFrontierTile(eligibleFrontierByOwner, ownerId, tileKey);
    return;
  }
  if (!(target.town || target.dockId) && !ctx.isInReach(ownerId, target)) return;
  if (ctx.settleRejectionForActor(ownerId) || !ctx.hasAvailableDevelopmentSlot(ownerId)) {
    insertEligibleFrontierTile(eligibleFrontierByOwner, ownerId, tileKey);
    return;
  }
  const commandId = ctx.nextCommandId(ownerId, tileKey);
  ctx.startSettlementProcess({ commandId, playerId: ownerId, targetKey: tileKey, target, startedAt: ctx.now() });
};

/**
 * Evaluates tileKey for ownerId (rules 1-6) and, if eligible, attempts an
 * immediate settle (or queues it). This is the single entry point every hook
 * (frontier-membership, tier-upgrade ring, capture ring, tech-unlock sweep)
 * should call for one newly-relevant tile.
 */
export const evaluateAndAttemptSettle = (
  eligibleFrontierByOwner: EligibleFrontierByOwner,
  ownerId: string,
  tileKey: string,
  eligibilityDeps: EvaluateTileEligibilityDeps,
  settleCtx: SettleAttemptContext
): void => {
  if (!evaluateTileEligibility(tileKey, ownerId, eligibilityDeps)) return;
  attemptImmediateSettle(eligibleFrontierByOwner, ownerId, tileKey, settleCtx);
};

/**
 * Drains ownerId's queued eligible tiles while a development slot is free,
 * attempting settlement for each (re-queuing it if it turns out blocked).
 * Called after a settlement/build completes and frees a slot
 * (resolvePendingSettlement) so the next queued tile starts the same tick
 * instead of waiting for the next 30s territory-automation pass.
 */
export const drainEligibleFrontierQueue = (
  eligibleFrontierByOwner: EligibleFrontierByOwner,
  ownerId: string,
  ctx: SettleAttemptContext
): number => {
  let settled = 0;
  const set = eligibleFrontierByOwner.get(ownerId);
  const maxAttempts = set ? set.size : 0;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (ctx.settleRejectionForActor(ownerId) || !ctx.hasAvailableDevelopmentSlot(ownerId)) break;
    const tileKey = popNextEligibleFrontierTile(eligibleFrontierByOwner, ownerId);
    if (!tileKey) break;
    const before = eligibleFrontierCountForOwner(eligibleFrontierByOwner, ownerId);
    attemptImmediateSettle(eligibleFrontierByOwner, ownerId, tileKey, ctx);
    // attemptImmediateSettle only re-inserts tileKey (net queue size
    // unchanged) when it's still blocked/ineligible for settling right now --
    // otherwise it started settlement, so count it.
    if (eligibleFrontierCountForOwner(eligibleFrontierByOwner, ownerId) === before) settled += 1;
  }
  return settled;
};
