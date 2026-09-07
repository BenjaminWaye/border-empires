/**
 * Changed-reach-tile TILE_DELTA_BATCH re-broadcast for reach-owner changes.
 *
 * Background: `applyUnsettleDowngrade`'s doc comment (runtime-reach-border-
 * apply.ts) flags a known gap — pure reach-border movement (an anchor
 * activating/deactivating, which can shift `Runtime.reachBorder` across many
 * tiles) is only pushed to the ONE player whose own reach changed, as a bare
 * `REACH_UPDATE` tile-key list (see runtime-reach-update.ts). No `TILE_DELTA`
 * is re-emitted for the affected tiles to anyone else, so every other
 * viewer's cached `reachOwnerId` for those tiles goes stale until they click
 * the tile (forcing a fresh fetch) or reconnect.
 *
 * Any diff between client and server on reach is treated as detrimental to
 * gameplay, so this module marks EVERY tile whose reach owner actually
 * changed as dirty — no adjacency/rival-contest filter. (An earlier version
 * of this module narrowed the broadcast to border-adjacent tiles only, to
 * bound broadcast volume on a large empire's anchor toggle; that filter was
 * removed by explicit product decision — see the module's git history and
 * `runtime-reach-contested-flush.ts` for the resulting broadcast cost.) The
 * existing per-subscriber vision gating downstream in simulation-service.ts
 * still applies unchanged, so this only ever reaches players who can
 * currently see the tile.
 */

/** Bounded by the number of distinct tile keys ever flagged between flushes — cleared every flush. */
export type ReachChangedTilesDirtyState = {
  readonly dirtyChangedTileKeys: Set<string>;
};

export const createReachChangedTilesDirtyState = (): ReachChangedTilesDirtyState => ({
  dirtyChangedTileKeys: new Set<string>()
});

/**
 * Diffs `oldBorder` against `newBorder` and marks every tile whose reach
 * owner actually changed as dirty. Cheap no-op when the two maps are
 * reference-identical (neither apply path mutates in place, so this only
 * happens for callers that pass the same map twice, e.g. tests).
 */
export const markChangedReachTilesDirty = (
  state: ReachChangedTilesDirtyState,
  oldBorder: ReadonlyMap<string, string>,
  newBorder: ReadonlyMap<string, string>
): void => {
  if (oldBorder === newBorder) return;
  for (const [key, newOwner] of newBorder) {
    if (oldBorder.get(key) !== newOwner) state.dirtyChangedTileKeys.add(key);
  }
  for (const key of oldBorder.keys()) {
    if (!newBorder.has(key)) state.dirtyChangedTileKeys.add(key);
  }
};
