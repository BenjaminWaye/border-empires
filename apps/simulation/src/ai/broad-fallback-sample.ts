// Bounds the AI planner's broad-frontier-fallback origin sets to a small,
// evenly-strided sample — same technique as ai-expansion-objective.ts's
// MAX_TERRITORY_SAMPLE. Replaces the old SKIP_BROAD_FALLBACK_OWNED_TILE_THRESHOLD
// (which skipped the broad fallback entirely once an empire exceeded 500
// owned tiles, to avoid an unbounded full-array scan) — that permanently
// disabled the ONLY mechanism that lets the AI look beyond a locally-waste
// narrow/focus window. Confirmed in production: 4/5 staging AI players
// (501-1667 owned tiles) never issued a single EXPAND command because of
// this. See automation-command-planner.ts's broad-fallback section and its
// regression tests (automation-command-planner.broad-fallback-bound.test.ts).
export const BROAD_FALLBACK_FRONTIER_SAMPLE_CAP = 300;

export const strideSample = <T>(items: readonly T[], maxCount: number): readonly T[] => {
  if (items.length <= maxCount) return items;
  const step = Math.max(1, Math.ceil(items.length / maxCount));
  const sampled: T[] = [];
  for (let i = 0; i < items.length; i += step) sampled.push(items[i]!);
  return sampled;
};

// Lazy, memoized owned-FRONTIER-tile scans used by the broad fallback's
// origin union in automation-command-planner.ts. Factored out here (rather
// than inlined as closures in planAutomationCommand) purely to keep that
// file under the repo's 500-line-per-file cap — no behavior change.
export const createOwnedFrontierTileScans = <TTile extends { x: number; y: number; terrain: string; ownerId?: string | undefined; ownershipState?: string | undefined }>(params: {
  ownedTiles: readonly TTile[];
  frontierTilesLength: number;
  playerId: string;
  restrictToFocus: (tiles: readonly TTile[]) => readonly TTile[];
}): {
  ownedFrontierTiles: () => readonly TTile[];
  ownedFrontierTilesSample: () => readonly TTile[];
  /** Cached count without forcing computation — for diagnostics only. */
  ownedFrontierTilesComputedCount: () => number;
} => {
  const { ownedTiles, frontierTilesLength, playerId, restrictToFocus } = params;
  const isOwnedFrontierLand = (tile: TTile): boolean =>
    tile.terrain === "LAND" && tile.ownerId === playerId && tile.ownershipState === "FRONTIER";

  // Last-resort fallback for when frontierTiles/hotFrontierTiles are ALL
  // empty. At steady state for any real empire this is never reached, so it
  // must be lazy — this used to scan every owned tile unconditionally on
  // every single plan regardless of empire size (a 20k-tile empire
  // re-scanned 20k tiles for a value discarded on nearly every call).
  let ownedFrontierTilesCache: readonly TTile[] | undefined;
  const ownedFrontierTiles = (): readonly TTile[] => {
    if (!ownedFrontierTilesCache) {
      ownedFrontierTilesCache = restrictToFocus(ownedTiles).filter(isOwnedFrontierLand);
    }
    return ownedFrontierTilesCache;
  };

  // Bounded sibling of ownedFrontierTiles() above, for the broad fallback's
  // origin union. Striding ownedTiles before filtering to FRONTIER can land
  // on zero FRONTIER tiles when they're a small minority of a mature empire
  // — only safe when frontierTiles already did the real work; when it's
  // empty (the true "incomplete input" case) fall back to the accurate
  // ownedFrontierTiles() instead of compounding sampling error.
  let ownedFrontierTilesSampleCache: readonly TTile[] | undefined;
  const ownedFrontierTilesSample = (): readonly TTile[] => {
    if (!ownedFrontierTilesSampleCache) {
      ownedFrontierTilesSampleCache = frontierTilesLength > 0
        ? restrictToFocus(strideSample(ownedTiles, BROAD_FALLBACK_FRONTIER_SAMPLE_CAP)).filter(isOwnedFrontierLand)
        : ownedFrontierTiles();
    }
    return ownedFrontierTilesSampleCache;
  };

  return {
    ownedFrontierTiles,
    ownedFrontierTilesSample,
    ownedFrontierTilesComputedCount: () => ownedFrontierTilesCache?.length ?? 0
  };
};
