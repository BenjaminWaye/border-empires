import {
  grantAnchorToBorder,
  liveReachForOwner,
  reassessBorderOnAnchorDeactivation,
  tileKeysInReach,
  type LandConnectivityQuery,
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
  /**
   * Free, instant FRONTIER claim for tiles that just entered `ownerId`'s
   * persistent reach border while genuinely unowned (`tileOwnership(tileKey)`
   * has no `ownerId` at all -- a border-only change, e.g. a rival's border
   * retreating off a tile without changing who owns it, must NOT trigger
   * this). Batched: one anchor activation can newly cover dozens of neutral
   * tiles at once (a fresh town, including a respawn), and this must produce
   * ONE claim/event, not one per tile. Mirrors `downgradeToFrontier`'s
   * "runtime drives the actual mutation" shape; the caller
   * (`applyReachAnchorActivationToBorder`) only decides WHICH tiles and WHEN,
   * never how they're mutated.
   */
  autoClaimFrontier: (tileKeys: readonly string[], ownerId: string, causeCommandId: string) => void;
  /**
   * True when the tile at (x, y) is LAND terrain. Gates every non-
   * `crossesWater` anchor's disk to a land-connected path (see
   * `LandConnectivityQuery`, `ReachAnchor.crossesWater`). Optional purely so
   * existing test callers that don't care about terrain keep working; real
   * runtime wiring always supplies it.
   */
  isLandTile?: LandConnectivityQuery;
};

/**
 * Builds a ReachBorderApplyContext from the runtime's own primitives. Lives
 * here rather than in the runtime class so the border-mutation wiring sits
 * with the rules it feeds (and to keep the 4.7k-line runtime from growing).
 */
export const createReachBorderApplyContext = (deps: {
  gatherReachAnchors: () => ReachAnchor[];
  playerSummaryIds: () => Iterable<string>;
  getTile: (tileKey: string) => { ownerId?: string | undefined; ownershipState?: string | undefined } | undefined;
  downgradeToFrontier: (tileKey: string, causeCommandId: string) => void;
  autoClaimFrontier: (tileKeys: readonly string[], ownerId: string, causeCommandId: string) => void;
  isLandTile?: LandConnectivityQuery;
}): ReachBorderApplyContext => ({
  gatherReachAnchors: deps.gatherReachAnchors,
  rivalOwnerIds: () => [...deps.playerSummaryIds()].filter((id) => !id.startsWith("barbarian-")).sort(),
  tileOwnership: deps.getTile,
  downgradeToFrontier: deps.downgradeToFrontier,
  autoClaimFrontier: deps.autoClaimFrontier,
  ...(deps.isLandTile ? { isLandTile: deps.isLandTile } : {})
});

/** Memoised live-coverage lookup, shared by both apply paths. */
const liveReachLookup = (
  anchors: ReachAnchor[],
  landConnectivity?: LandConnectivityQuery
): ((ownerId: string) => ReadonlySet<string>) => {
  const cache = new Map<string, ReadonlySet<string>>();
  return (ownerId: string): ReadonlySet<string> => {
    let set = cache.get(ownerId);
    if (!set) {
      set = liveReachForOwner(ownerId, anchors, landConnectivity);
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
 * The empty-slot contest described in grantAnchorToBorder is ALWAYS on: an
 * unclaimed border slot sitting over a rival's SETTLED tile is resolved as a
 * real contest rather than granted silently. There is deliberately no option
 * to turn it off.
 *
 * The world-init seeding pass used to disable it, on the assumption that
 * "persisted/seeded worlds start from a consistent state" — they don't.
 * `reachBorder` is not persisted; it is rebuilt from anchor geometry on every
 * boot. With the contest off, an anchor whose disk covered a rival's SETTLED
 * tile took the border slot silently, with no `overtaken` entry and therefore
 * no unsettle — leaving `reachOwnerId` = one player and `ownerId`/SETTLED =
 * another, permanently, and re-created identically on every restart. Keeping
 * the contest on is deterministic regardless of the order anchors are replayed
 * in, because `defenderLiveReach` resolves against `gatherReachAnchors()`
 * (every live anchor in the world), not against the partially-rebuilt border.
 *
 * `skipNeutralAutoClaim` is the part the seeding pass genuinely does need:
 * see the auto-claim block below.
 */
export const applyReachAnchorActivationToBorder = (
  border: ReadonlyMap<string, string>,
  anchor: ReachAnchor,
  reachUpdateState: ReachUpdateState,
  context: ReachBorderApplyContext,
  causeCommandId: string,
  options?: { skipNeutralAutoClaim?: boolean }
): Map<string, string> => {
  const defenderLiveReach = liveReachLookup(context.gatherReachAnchors(), context.isLandTile);
  const settledOwnerAt = (tileKey: string): string | undefined => {
    const tile = context.tileOwnership(tileKey);
    return tile?.ownershipState === "SETTLED" ? tile.ownerId : undefined;
  };
  const result = grantAnchorToBorder(border, anchor, defenderLiveReach, settledOwnerAt, context.isLandTile);
  markReachDirty(reachUpdateState, anchor.ownerId);
  // grantAnchorToBorder's "unclaimed slot -> granted outright" branch (see
  // its own doc comment) never appears in `overtaken` — nobody lost the
  // tile, so there is nothing to unsettle. But it may still be genuinely
  // neutral ground that just entered anchor.ownerId's border, which is what
  // auto-claim below cares about. Collected rather than claimed tile-by-tile
  // so a single anchor activation (which can newly cover dozens of neutral
  // tiles at once -- a fresh town, including a respawn) produces ONE batched
  // claim/event, not one per tile.
  const autoClaimKeys: string[] = [];
  for (const key of tileKeysInReach(anchor, context.isLandTile)) {
    if (result.border.get(key) === anchor.ownerId && border.get(key) !== anchor.ownerId) {
      // Reach just grew onto ground nobody owns at all (a plain grant onto
      // empty ground, or the settled-on-unclaimed contest above resolving in
      // anchor.ownerId's favor over truly neutral ground) -- auto-claim it
      // FRONTIER, free and instant. A tile that changed hands from a RIVAL
      // (settleOvertaken's territory) keeps its existing owner; only genuine
      // no-man's-land is eligible here. Skipped for the world-init seeding
      // pass (skipNeutralAutoClaim: true) -- that pass replays every anchor a
      // world already has against an EMPTY border, so "just entered the
      // border" is true for the anchor's ENTIRE disk at once; auto-claiming
      // there would bulk-flip every neutral tile in the map to FRONTIER once
      // at boot rather than only reacting to real anchor activations going
      // forward. (The rival-SETTLED contest above is deliberately NOT skipped
      // at boot -- see this function's doc comment.) Barbarian territory is
      // environment, not a bordered empire (see this file's module doc) -- it
      // never auto-claims neutral ground; ATTACK/capture stays the only route
      // onto or out of barbarian-adjacent land.
      if (
        options?.skipNeutralAutoClaim !== true &&
        !anchor.ownerId.startsWith("barbarian-") &&
        !context.tileOwnership(key)?.ownerId
      ) {
        autoClaimKeys.push(key);
      }
    }
  }
  if (autoClaimKeys.length > 0) context.autoClaimFrontier(autoClaimKeys, anchor.ownerId, causeCommandId);
  settleOvertaken(result.overtaken, reachUpdateState, context, causeCommandId);
  return result.border;
};

/**
 * Applies one anchor DEACTIVATION. No-op for any tile still covered by
 * another of the owner's own live anchors. Otherwise: transfers to a rival
 * whose CURRENT live reach already covers that ground, or — if no rival
 * covers it either — vacates it outright, downgrading a SETTLED tile there
 * back to FRONTIER via settleOvertaken. See reassessBorderOnAnchorDeactivation's
 * doc comment.
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
  const liveReach = liveReachLookup(context.gatherReachAnchors(), context.isLandTile);
  const result = reassessBorderOnAnchorDeactivation(
    border,
    anchor,
    liveReach(anchor.ownerId),
    liveReach,
    context.rivalOwnerIds(),
    context.isLandTile
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

/**
 * Shared body for a runtime's `autoClaimFrontier` hook: grants every
 * genuinely neutral tile in `tileKeys` FRONTIER for free the instant it
 * enters `ownerId`'s reach border. LAND-only (matches EXPAND's own terrain
 * gate); a re-check of `ownerId === undefined` guards each tile against
 * having been claimed by some other path between the border computation and
 * this call. Batched into ONE event -- a single anchor activation (a fresh
 * town, including a respawn) can newly cover dozens of neutral tiles at
 * once, and emitting one TILE_DELTA_BATCH per tile there would both spam the
 * wire and get coalesced back together downstream anyway.
 */
export const applyReachAutoClaim = <
  TTile extends {
    terrain?: string | undefined;
    ownerId?: string | undefined;
    ownershipState?: string | undefined;
    muster?: { ownerId: string } | undefined;
  },
  TDelta
>(
  tileKeys: readonly string[],
  ownerId: string,
  causeCommandId: string,
  deps: {
    getTile: (tileKey: string) => TTile | undefined;
    replaceTileState: (tileKey: string, tile: TTile, commandId: string) => void;
    tileDeltaFromState: (tile: TTile) => TDelta;
    emitEvent: (event: { eventType: "TILE_DELTA_BATCH"; commandId: string; playerId: string; tileDeltas: Array<TDelta & { ownerId?: string | undefined; ownershipState?: string | undefined; musterJson?: string }> }) => void;
  }
): void => {
  const claimCommandId = `reach-auto-claim:${causeCommandId}`;
  const tileDeltas: Array<TDelta & { ownerId?: string | undefined; ownershipState?: string | undefined; musterJson?: string }> = [];
  for (const tileKey of tileKeys) {
    const tile = deps.getTile(tileKey);
    if (!tile || tile.ownerId !== undefined || tile.terrain !== "LAND") continue;
    // A "neutral" tile can still carry a stale `muster` flag from a previous
    // owner (e.g. a tile that decayed/was cut off without going through the
    // capture path that normally strips it). Auto-claiming it for `ownerId`
    // must not hand that leftover flag -- and its pooled manpower -- to the
    // new owner, so explicitly drop it here just like every other
    // ownership-changing path does (see runtime-lock-resolution.ts,
    // runtime-out-of-reach-decay.ts, runtime-encirclement-application.ts).
    const hadMuster = Boolean(tile.muster);
    const claimed: TTile = { ...tile, ownerId, ownershipState: "FRONTIER", muster: undefined };
    deps.replaceTileState(tileKey, claimed, claimCommandId);
    tileDeltas.push({ ...deps.tileDeltaFromState(claimed), ownerId, ownershipState: "FRONTIER", ...(hadMuster ? { musterJson: "" } : {}) });
  }
  if (tileDeltas.length === 0) return;
  deps.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId: claimCommandId, playerId: ownerId, tileDeltas });
};
