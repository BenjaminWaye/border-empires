import {
  grantAnchorToBorder,
  liveReachForOwner,
  reassessBorderOnAnchorDeactivation,
  type ReachAnchor
} from "@border-empires/shared";
import { markReachDirty, type ReachUpdateState } from "./runtime-reach-update.js";

/**
 * Applying reach-anchor activations and deactivations to the persistent
 * border. Extracted from Runtime so the border-mutation rules live next to the
 * REACH_UPDATE push they now feed (runtime-reach-update.ts) instead of being
 * buried in the 5k-line runtime class.
 *
 * Both operations share the same shape: resolve the contest against live
 * anchor coverage, swap in the new border, mark every owner whose reach
 * changed as needing a push, then downgrade any tile that actually changed
 * hands from SETTLED to FRONTIER — the "unsettle" transition. Barbarian
 * territory is environment rather than a bordered empire: it contributes no
 * anchors and is exempt from being overtaken this way, so ATTACK/capture stays
 * the only route onto barbarian land.
 */
export type ReachBorderApplyContext = {
  /** Every anchor currently live in the world. */
  gatherReachAnchors: () => ReachAnchor[];
  /** Non-barbarian player ids, used to resolve deactivation contests. */
  rivalOwnerIds: () => string[];
  /** Looks up a tile's ownership by key, for the unsettle downgrade. */
  tileOwnership: (tileKey: string) => { ownerId?: string | undefined; ownershipState?: string | undefined } | undefined;
  /** Applies the SETTLED -> FRONTIER downgrade through the runtime's own path. */
  downgradeToFrontier: (tileKey: string, causeCommandId: string) => void;
};

/** Memoised live-coverage lookup, shared by both apply paths. */
const liveReachLookup = (anchors: ReachAnchor[]): ((ownerId: string) => ReadonlySet<string>) => {
  const cache = new Map<string, ReadonlySet<string>>();
  return (ownerId: string): ReadonlySet<string> => {
    let set = cache.get(ownerId);
    if (!set) {
      set = liveReachForOwner(ownerId, anchors);
      cache.set(ownerId, set);
    }
    return set;
  };
};

/** Shared tail: mark reach dirty for both sides and unsettle what changed hands. */
const settleOvertaken = (
  overtaken: ReadonlyArray<{ tileKey: string; fromOwnerId: string; toOwnerId: string }>,
  reachUpdateState: ReachUpdateState,
  context: ReachBorderApplyContext,
  causeCommandId: string
): void => {
  for (const { tileKey, fromOwnerId, toOwnerId } of overtaken) {
    markReachDirty(reachUpdateState, fromOwnerId);
    markReachDirty(reachUpdateState, toOwnerId);
    if (fromOwnerId.startsWith("barbarian-")) continue;
    const tile = context.tileOwnership(tileKey);
    if (!tile || tile.ownerId !== fromOwnerId || tile.ownershipState !== "SETTLED") continue;
    context.downgradeToFrontier(tileKey, causeCommandId);
  }
};

/**
 * Applies one anchor ACTIVATION, returning the updated border.
 *
 * `contestSettledOnUnclaimed` (default true) enables the empty-slot contest
 * described in grantAnchorToBorder: an unclaimed border slot sitting over a
 * rival's SETTLED tile is resolved as a real contest instead of being granted
 * silently. Pass false for the world-init seeding pass — that rebuilds the
 * border for an already-consistent world by replaying every anchor against an
 * empty map, so every settled tile would look "unclaimed" and the whole pass
 * would turn into a world-wide re-contest rather than a reconstruction.
 */
export const applyReachAnchorActivationToBorder = (
  border: ReadonlyMap<string, string>,
  anchor: ReachAnchor,
  reachUpdateState: ReachUpdateState,
  context: ReachBorderApplyContext,
  causeCommandId: string,
  options?: { contestSettledOnUnclaimed?: boolean }
): Map<string, string> => {
  const defenderLiveReach = liveReachLookup(context.gatherReachAnchors());
  const settledOwnerAt =
    options?.contestSettledOnUnclaimed === false
      ? undefined
      : (tileKey: string): string | undefined => {
          const tile = context.tileOwnership(tileKey);
          return tile?.ownershipState === "SETTLED" ? tile.ownerId : undefined;
        };
  const result = grantAnchorToBorder(border, anchor, defenderLiveReach, settledOwnerAt);
  markReachDirty(reachUpdateState, anchor.ownerId);
  settleOvertaken(result.overtaken, reachUpdateState, context, causeCommandId);
  return result.border;
};

/**
 * Applies one anchor DEACTIVATION. Sticky by default (does nothing) unless a
 * rival's CURRENT live reach already covers ground this anchor used to help
 * defend and the owner can no longer defend it themselves — see
 * reassessBorderOnAnchorDeactivation's doc comment.
 */
export const applyReachAnchorDeactivationToBorder = (
  border: ReadonlyMap<string, string>,
  anchor: ReachAnchor,
  reachUpdateState: ReachUpdateState,
  context: ReachBorderApplyContext,
  causeCommandId: string
): Map<string, string> => {
  // gatherReachAnchors already reflects the deactivation: the runtime updates
  // its tile state before this hook runs.
  const liveReach = liveReachLookup(context.gatherReachAnchors());
  const result = reassessBorderOnAnchorDeactivation(
    border,
    anchor,
    liveReach(anchor.ownerId),
    liveReach,
    context.rivalOwnerIds()
  );
  markReachDirty(reachUpdateState, anchor.ownerId);
  settleOvertaken(result.overtaken, reachUpdateState, context, causeCommandId);
  return result.border;
};

/**
 * Shared body for a runtime's `downgradeToFrontier` hook: applies the
 * SETTLED -> FRONTIER mutation, then broadcasts it. This flip happens as a
 * side effect of the *overtaking* border push (settleOvertaken), not as
 * part of the triggering command's own tileDeltas -- without an explicit
 * broadcast here, neither the tile's owner nor the player who just overtook
 * the border learns about it until they click the tile (forcing a fresh
 * fetch) or reconnect.
 */
export const applyUnsettleDowngrade = <TTile extends { ownerId?: string | undefined; ownershipState?: string | undefined }, TDelta>(
  tileKey: string,
  causeCommandId: string,
  deps: {
    getTile: (tileKey: string) => TTile | undefined;
    replaceTileState: (tileKey: string, tile: TTile, commandId: string) => void;
    tileDeltaFromState: (tile: TTile) => TDelta;
    emitEvent: (event: { eventType: "TILE_DELTA_BATCH"; commandId: string; playerId: string; tileDeltas: Array<TDelta & { ownerId?: string | undefined; ownershipState?: string | undefined }> }) => void;
  }
): void => {
  const tile = deps.getTile(tileKey);
  if (!tile) return;
  const downgraded: TTile = { ...tile, ownershipState: "FRONTIER" };
  const unsettleCommandId = `unsettle:${causeCommandId}:${tileKey}`;
  deps.replaceTileState(tileKey, downgraded, unsettleCommandId);
  if (!downgraded.ownerId) return;
  deps.emitEvent({
    eventType: "TILE_DELTA_BATCH",
    commandId: unsettleCommandId,
    playerId: downgraded.ownerId,
    tileDeltas: [{ ...deps.tileDeltaFromState(downgraded), ownerId: downgraded.ownerId, ownershipState: downgraded.ownershipState }]
  });
};
