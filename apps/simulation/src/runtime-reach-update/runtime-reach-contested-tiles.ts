import { REACH_NEIGHBOR_OFFSETS, tileKey, wrapCoord, WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";

/**
 * Contested-border TILE_DELTA_BATCH re-broadcast for reach-owner changes.
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
 * Broadcasting every tile whose reach owner changed would be too heavy — a
 * large empire's anchor toggling can shift reach across hundreds of interior
 * tiles nobody but that owner cares about. This module narrows the broadcast
 * to tiles that actually sit on contested ground: a changed tile qualifies
 * only if it, or one of its 8-directional neighbors, is assigned (in the new
 * border, or via real tile ownership) to a different owner than the tile's
 * new reach owner. Interior reach flips deep inside one player's own
 * territory are deliberately never broadcast under this module.
 */

/** Bounded by the number of distinct tile keys ever flagged between flushes — cleared every flush. */
export type ReachContestedDirtyState = {
  readonly dirtyContestedTileKeys: Set<string>;
};

export const createReachContestedDirtyState = (): ReachContestedDirtyState => ({
  dirtyContestedTileKeys: new Set<string>()
});

const parseTileKey = (key: string): { x: number; y: number } | undefined => {
  const [rawX, rawY] = key.split(",");
  if (rawX === undefined || rawY === undefined) return undefined;
  const x = Number(rawX);
  const y = Number(rawY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
  return { x, y };
};

/** Everything the border-adjacency check needs to know about real tile ownership. */
export type ContestedTileOwnershipQuery = (tileKey: string) => string | undefined;

/**
 * True when `changedKey`'s new reach owner (`newOwnerId`, possibly
 * `undefined` for a vacated tile) sits on contested ground: itself or an
 * 8-directional neighbor is assigned — in the new border map or via actual
 * tile ownership — to a different, defined owner.
 */
const isBorderAdjacentToRival = (
  changedKey: string,
  newOwnerId: string | undefined,
  newBorder: ReadonlyMap<string, string>,
  actualOwnerAt: ContestedTileOwnershipQuery
): boolean => {
  const selfActualOwner = actualOwnerAt(changedKey);
  if (selfActualOwner && selfActualOwner !== newOwnerId) return true;

  const parsed = parseTileKey(changedKey);
  if (!parsed) return false;
  for (const { dx, dy } of REACH_NEIGHBOR_OFFSETS) {
    const neighborKey = tileKey(wrapCoord(parsed.x + dx, WORLD_WIDTH), wrapCoord(parsed.y + dy, WORLD_HEIGHT));
    const neighborBorderOwner = newBorder.get(neighborKey);
    if (neighborBorderOwner && neighborBorderOwner !== newOwnerId) return true;
    const neighborActualOwner = actualOwnerAt(neighborKey);
    if (neighborActualOwner && neighborActualOwner !== newOwnerId) return true;
  }
  return false;
};

/**
 * Diffs `oldBorder` against `newBorder` and marks every tile whose reach
 * owner actually changed AND which sits on contested ground (see module doc)
 * as dirty. Cheap no-op when the two maps are reference-identical (neither
 * apply path mutates in place, so this only happens for callers that pass
 * the same map twice, e.g. tests).
 */
export const markContestedReachTilesDirty = (
  state: ReachContestedDirtyState,
  oldBorder: ReadonlyMap<string, string>,
  newBorder: ReadonlyMap<string, string>,
  actualOwnerAt: ContestedTileOwnershipQuery
): void => {
  if (oldBorder === newBorder) return;
  const changedKeys = new Set<string>();
  for (const [key, newOwner] of newBorder) {
    if (oldBorder.get(key) !== newOwner) changedKeys.add(key);
  }
  for (const key of oldBorder.keys()) {
    if (!newBorder.has(key)) changedKeys.add(key);
  }
  for (const key of changedKeys) {
    const newOwnerId = newBorder.get(key);
    if (isBorderAdjacentToRival(key, newOwnerId, newBorder, actualOwnerAt)) {
      state.dirtyContestedTileKeys.add(key);
    }
  }
};
