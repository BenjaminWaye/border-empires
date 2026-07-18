/**
 * Resolves per-player tile sets from the global tilesByKey map for the AI
 * planner. Extracted from ai-planner-worker.ts to keep that file under the
 * 500-line project limit.
 *
 * The cache short-circuit on tileCollectionVersion is preserved — the
 * expensive branch (cache miss) now uses 5 inline single-pass loops instead
 * of .map().filter() chains, eliminating intermediate array allocations
 * without changing per-list iteration order (which matters for AI determinism).
 */

import type { PlannerPlayerView, PlannerTileView } from "./planner-world-view.js";

export type ResolvedPlayerTiles = {
  ownedTiles: PlannerTileView[];
  frontierTiles: PlannerTileView[];
  hotFrontierTiles: PlannerTileView[];
  strategicFrontierTiles: PlannerTileView[];
  buildCandidateTiles: PlannerTileView[];
  pendingSettlementTileKeys: Set<string>;
  townTiles: PlannerTileView[];
};

type CachedPlayerTiles = {
  tileCollectionVersion: number;
} & ResolvedPlayerTiles;

/**
 * Resolve the tile collections for a planner player.
 *
 * Cache is keyed by player.tileCollectionVersion: if the version matches, the
 * cached arrays are returned directly (no allocation). On a miss, single-pass
 * loops over each tile-key list build the arrays and populate the cache.
 */
export const resolvePlayerTiles = (
  player: PlannerPlayerView,
  tilesByKey: ReadonlyMap<string, PlannerTileView>,
  cache: Map<string, CachedPlayerTiles>
): ResolvedPlayerTiles => {
  const cached = cache.get(player.id);
  if (cached && cached.tileCollectionVersion === player.tileCollectionVersion) {
    return {
      ownedTiles: cached.ownedTiles,
      frontierTiles: cached.frontierTiles,
      hotFrontierTiles: cached.hotFrontierTiles,
      strategicFrontierTiles: cached.strategicFrontierTiles,
      buildCandidateTiles: cached.buildCandidateTiles,
      pendingSettlementTileKeys: cached.pendingSettlementTileKeys,
      townTiles: cached.townTiles
    };
  }

  // Cache miss — single-pass loops, no intermediate allocations.
  const ownedTiles: PlannerTileView[] = [];
  for (const k of player.territoryTileKeys) {
    const t = tilesByKey.get(k);
    if (t) ownedTiles.push(t);
  }

  const frontierTiles: PlannerTileView[] = [];
  for (const k of player.frontierTileKeys) {
    const t = tilesByKey.get(k);
    if (t) frontierTiles.push(t);
  }

  const hotFrontierTiles: PlannerTileView[] = [];
  for (const k of player.hotFrontierTileKeys) {
    const t = tilesByKey.get(k);
    if (t) hotFrontierTiles.push(t);
  }

  const strategicFrontierTiles: PlannerTileView[] = [];
  for (const k of player.strategicFrontierTileKeys) {
    const t = tilesByKey.get(k);
    if (t) strategicFrontierTiles.push(t);
  }

  const buildCandidateTiles: PlannerTileView[] = [];
  for (const k of player.buildCandidateTileKeys) {
    const t = tilesByKey.get(k);
    if (t) buildCandidateTiles.push(t);
  }

  const pendingSettlementTileKeys = new Set(player.pendingSettlementTileKeys);

  // Small (tens of tiles) — a plain lookup loop here is fine, same as the
  // buckets above; no separate incremental cache needed for this size.
  const townTiles: PlannerTileView[] = [];
  for (const k of player.townTileKeys) {
    const t = tilesByKey.get(k);
    if (t) townTiles.push(t);
  }

  const resolved: ResolvedPlayerTiles = {
    ownedTiles,
    frontierTiles,
    hotFrontierTiles,
    strategicFrontierTiles,
    buildCandidateTiles,
    pendingSettlementTileKeys,
    townTiles
  };

  cache.set(player.id, {
    tileCollectionVersion: player.tileCollectionVersion,
    ...resolved
  });

  return resolved;
};
