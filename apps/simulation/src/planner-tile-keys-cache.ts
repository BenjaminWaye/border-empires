/**
 * Incrementally-maintained tile key cache for the planner player-view export.
 *
 * Background
 * ----------
 * The planner sync exports six per-player tile key arrays to the AI worker.
 * Previously these were derived by spreading the corresponding `Set<string>`
 * fields from `PlayerRuntimeSummary` on every cache miss:
 *
 *   territoryTileKeys:        [...summary.territoryTileKeys]
 *   frontierTileKeys:         [...summary.frontierTileKeys]
 *   hotFrontierTileKeys:      [...summary.hotFrontierTileKeys]
 *   strategicFrontierTileKeys:[...summary.strategicFrontierTileKeys]
 *   buildCandidateTileKeys:   [...summary.buildCandidateTileKeys]
 *   pendingSettlementTileKeys:[...summary.pendingSettlementsByTile.keys()]
 *
 * The cache was invalidated (entry deleted) on EVERY tile mutation that touched
 * the player — including same-owner mutations like muster ticks, population
 * growth, and structure-status updates — so any active player was a guaranteed
 * cache miss on every planner-sync cycle. For a large empire (≥2 000 tiles),
 * `[...summary.territoryTileKeys]` alone allocates and fills a 2 000-element
 * array, and this happened for every AI player on every sync. With five AI
 * players at steady state, that was ≥10 000 element copies per cycle, repeated
 * at planner-sync frequency (~1 Hz), all on the single shared CPU.
 *
 * Fix
 * ---
 * Each per-player cache entry now holds six `TileKeyArrayEntry` objects.  Each
 * entry is a string array (`keys`) plus a reverse-index Map (`positionOf`).
 * Mutations apply through `incrementalAdd` / `incrementalRemove`, which are
 * both O(1) via swap-with-last-then-pop.  The planner export returns the live
 * `keys` array reference directly — no spread needed.  The downstream consumer
 * copies the data (via `worker.postMessage` structured clone or `new Set(...)`)
 * before the next mutation cycle, so sharing the live reference is safe on the
 * single-threaded runtime.
 *
 * Order guarantee
 * ---------------
 * `swap-pop` does NOT preserve insertion order; the arrays are order-independent.
 * All downstream consumers iterate or convert to Set — none rely on array index
 * or insertion order — so this is safe.  The invariant test in
 * `planner-tile-keys-cache.test.ts` asserts set-equality (not array equality)
 * after every mutation sequence.
 */

/** One incrementally-maintained key collection (array + reverse-index). */
export type TileKeyArrayEntry = {
  keys: string[];
  positionOf: Map<string, number>;
};

/** All six per-player collections in a single cache record. */
export type PlannerTileKeysCacheEntry = {
  territory: TileKeyArrayEntry;
  frontier: TileKeyArrayEntry;
  hotFrontier: TileKeyArrayEntry;
  strategicFrontier: TileKeyArrayEntry;
  buildCandidate: TileKeyArrayEntry;
  pendingSettlement: TileKeyArrayEntry;
};

function makeEntry(): TileKeyArrayEntry {
  return { keys: [], positionOf: new Map() };
}

/**
 * Add `key` to `entry`.  No-op if already present.  O(1).
 */
export function incrementalAdd(entry: TileKeyArrayEntry, key: string): void {
  if (entry.positionOf.has(key)) return;
  entry.positionOf.set(key, entry.keys.length);
  entry.keys.push(key);
}

/**
 * Remove `key` from `entry` via swap-with-last-then-pop.  No-op if absent.
 * O(1).  Does NOT preserve insertion order — callers must not depend on order.
 */
export function incrementalRemove(entry: TileKeyArrayEntry, key: string): void {
  const idx = entry.positionOf.get(key);
  if (idx === undefined) return;
  const lastIdx = entry.keys.length - 1;
  if (idx !== lastIdx) {
    const lastKey = entry.keys[lastIdx]!;
    entry.keys[idx] = lastKey;
    entry.positionOf.set(lastKey, idx);
  }
  entry.keys.pop();
  entry.positionOf.delete(key);
}

/**
 * Return whether `key` is present in `entry`.  O(1).
 */
export function incrementalHas(entry: TileKeyArrayEntry, key: string): boolean {
  return entry.positionOf.has(key);
}

/**
 * Replace the contents of `entry` with all keys in `source`.  O(|source|).
 * Used during full-rebuild paths (constructor, `rebuildPlannerCandidateIndexes`).
 */
export function resetFromIterable(entry: TileKeyArrayEntry, source: Iterable<string>): void {
  entry.keys.length = 0;
  entry.positionOf.clear();
  for (const key of source) {
    entry.positionOf.set(key, entry.keys.length);
    entry.keys.push(key);
  }
}

/** Summary shape subset that `initCacheFromSummary` reads. */
export type PlannerTileKeysSummarySnapshot = {
  readonly territoryTileKeys: ReadonlySet<string>;
  readonly frontierTileKeys: ReadonlySet<string>;
  readonly hotFrontierTileKeys: ReadonlySet<string>;
  readonly strategicFrontierTileKeys: ReadonlySet<string>;
  readonly buildCandidateTileKeys: ReadonlySet<string>;
  readonly pendingSettlementsByTile: ReadonlyMap<string, unknown>;
};

/**
 * Create (or overwrite) a cache entry for `playerId` by reading the current
 * state from `summary`.  O(territory) — called only during construction and
 * explicit full-rebuild paths, never during normal steady-state operation.
 */
export function initCacheEntryFromSummary(
  cache: Map<string, PlannerTileKeysCacheEntry>,
  playerId: string,
  summary: PlannerTileKeysSummarySnapshot
): PlannerTileKeysCacheEntry {
  const entry: PlannerTileKeysCacheEntry = {
    territory: makeEntry(),
    frontier: makeEntry(),
    hotFrontier: makeEntry(),
    strategicFrontier: makeEntry(),
    buildCandidate: makeEntry(),
    pendingSettlement: makeEntry()
  };
  resetFromIterable(entry.territory, summary.territoryTileKeys);
  resetFromIterable(entry.frontier, summary.frontierTileKeys);
  resetFromIterable(entry.hotFrontier, summary.hotFrontierTileKeys);
  resetFromIterable(entry.strategicFrontier, summary.strategicFrontierTileKeys);
  resetFromIterable(entry.buildCandidate, summary.buildCandidateTileKeys);
  resetFromIterable(entry.pendingSettlement, summary.pendingSettlementsByTile.keys());
  cache.set(playerId, entry);
  return entry;
}

/**
 * Verify that a cache entry matches its corresponding summary.
 * Used in tests to assert the invariant after every mutation sequence.
 */
export function verifyCacheEntryMatchesSummary(
  entry: PlannerTileKeysCacheEntry,
  summary: PlannerTileKeysSummarySnapshot
): { field: string; onlyInCache: string[]; onlyInSummary: string[] } | null {
  const checks: Array<{ field: string; cached: string[]; summary: Iterable<string> }> = [
    { field: "territory", cached: entry.territory.keys, summary: summary.territoryTileKeys },
    { field: "frontier", cached: entry.frontier.keys, summary: summary.frontierTileKeys },
    { field: "hotFrontier", cached: entry.hotFrontier.keys, summary: summary.hotFrontierTileKeys },
    { field: "strategicFrontier", cached: entry.strategicFrontier.keys, summary: summary.strategicFrontierTileKeys },
    { field: "buildCandidate", cached: entry.buildCandidate.keys, summary: summary.buildCandidateTileKeys },
    { field: "pendingSettlement", cached: entry.pendingSettlement.keys, summary: summary.pendingSettlementsByTile.keys() }
  ];
  for (const check of checks) {
    const summarySet = new Set(check.summary);
    const cachedSet = new Set(check.cached);
    const onlyInCache = check.cached.filter((k) => !summarySet.has(k));
    const onlyInSummary = [...summarySet].filter((k) => !cachedSet.has(k));
    if (onlyInCache.length > 0 || onlyInSummary.length > 0) {
      return { field: check.field, onlyInCache, onlyInSummary };
    }
  }
  return null;
}
