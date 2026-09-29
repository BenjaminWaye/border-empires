import type { ClientState } from "./client-state/client-state.js";
import type { Tile } from "./client-types.js";

// F5 (docs/replenishment-update-plan.md): arrow-gesture persistence audit.
// Mirrors client-tile-menu-delta-refresh.ts's "does this batch touch the
// currently-open thing" pattern, but for the arrow-gesture confirm sheet
// (client-arrow-gesture-confirm-sheet.ts) instead of the tile action menu.
//
// A confirm sheet stays open offering to SET_MUSTER an origin flag that a
// fresh TILE_DELTA_BATCH just revealed is no longer the local player's (an
// opposing capture landed on the origin tile while the sheet was up) is a
// stale/orphaned UI state -- "Go" would still fire a SET_MUSTER for a flag
// that's gone, relying on the server to silently reject it. This check lets
// the batch handler dismiss the sheet proactively instead.

/**
 * True if `state.pendingArrowGestureConfirm`'s origin tile is touched by
 * this batch's updates AND, per the now-merged tile in `state.tiles`, the
 * local player no longer owns a muster flag there (captured/destroyed, or
 * the muster flag itself was cleared, e.g. by a SET_MUSTER HOLD/cancel
 * racing the same drag). The confirm sheet's target tile is deliberately
 * NOT checked here -- an armed march can legally target any tile (enemy,
 * frontier, unexplored-at-arm-time), so a target-tile ownership change alone
 * is not invalidating; only losing the origin flag is.
 */
export const arrowGestureConfirmInvalidatedByTileDeltaBatch = (
  state: Pick<ClientState, "tiles" | "pendingArrowGestureConfirm" | "me">,
  updates: Array<{ x: number; y: number }>,
  keyFor: (x: number, y: number) => string
): boolean => {
  const pending = state.pendingArrowGestureConfirm;
  if (!pending) return false;
  const originKey = keyFor(pending.origin.x, pending.origin.y);
  if (!updates.some((update) => keyFor(update.x, update.y) === originKey)) return false;
  const originTile: Tile | undefined = state.tiles.get(originKey);
  return !originTile?.muster || originTile.ownerId !== state.me;
};
