import { OUT_OF_REACH_DECAY_MS, reachOwnerCountAt, type LandConnectivityQuery, type ReachAnchor } from "@border-empires/shared";

/**
 * Boot-time reconstruction of the persistent reach border.
 *
 * `reachBorder` is deliberately NOT persisted -- it is rebuilt from anchor
 * geometry every boot by replaying each live anchor through the same
 * grantAnchorToBorder path a live activation uses. That replay must keep the
 * rival-SETTLED contest ON (see applyReachAnchorActivationToBorder's doc
 * comment): with it off, an anchor whose disk covered a rival's SETTLED tile
 * silently took the border slot with no `overtaken` entry and therefore no
 * unsettle, leaving `reachOwnerId` = one player and `ownerId`/SETTLED =
 * another. Because the border is rebuilt identically on every restart, that
 * mismatch was permanent and self-renewing rather than self-healing.
 *
 * What the seeding pass does still skip is neutral auto-claim
 * (`skipNeutralAutoClaim`), which would otherwise bulk-flip every neutral
 * tile under every anchor's disk to FRONTIER once at boot.
 *
 * The contest cannot cascade, which is what makes replaying anchors in any
 * order safe: an anchor only counts while its own tile is SETTLED
 * (gatherReachAnchors), and every anchor's disk contains its own tile
 * (tileKeysInReach / landGatedTileKeysInDisk both include it). So a rival's
 * anchor tile is always inside that rival's own live reach, always resolves
 * as defended, and is never overtaken -- the contest can only ever downgrade
 * NON-anchor tiles, so no anchor can deactivate midway through the replay.
 *
 * Anchor geometry alone leaves a second gap: a live empire's border grows
 * past any single anchor's base disk over a session (reach-auto-claim/EXPAND
 * pushes it outward tile by tile), and that accumulated shape isn't anchor
 * geometry, so this replay can't reproduce it. A FRONTIER tile a player still
 * owns can land outside every current anchor's disk after a restart even
 * though nothing was actually lost. That must NOT be silently healed by
 * granting reach back -- an owned FRONTIER tile that's genuinely outside
 * reach (its covering anchor was lost mid-session) is supposed to stay that
 * way and run down its out-of-reach-decay timer, and boot can't tell the two
 * cases apart. What it CAN tell apart is whether that timer is already
 * running: `stampOwnedFrontierReachGapsForDecay` starts the same
 * out-of-reach-decay clock `stampOutOfReachDecayInAnchorDisk` starts for a
 * live anchor loss, but only for gap tiles that don't already carry one, so a
 * tile that lost reach purely to this replay's blind spot resolves itself
 * within one decay window (regains reach if an anchor still covers it once
 * that's re-evaluated, or decays like any other undefended ground) instead of
 * sitting forever with no reach and no path back.
 */

export type BorderSeedTileView = {
  x: number;
  y: number;
  ownerId?: string | undefined;
  ownershipState?: string | undefined;
  frontierDecayKind?: string | undefined;
};

/**
 * Invariant audit: how many tiles are SETTLED by a player other than the one
 * holding the reach-border slot under them. This should be 0 after seeding --
 * the contest resolves every such tile either by leaving the ground to its
 * settled holder (they still defend it with their own live reach) or by
 * taking the slot AND unsettling the loser.
 *
 * Barbarian-held ground is exempt: barbarian territory is environment rather
 * than a bordered empire, contributes no anchors, and is deliberately never
 * overtaken this way (see settleOvertaken's own barbarian guard).
 *
 * A nonzero count is the signal that this class of bug is back; it is logged
 * at boot rather than silently tolerated.
 */
export const countBorderOwnershipMismatches = (
  tiles: ReadonlyMap<string, BorderSeedTileView>,
  reachBorder: ReadonlyMap<string, string>
): number => {
  let mismatches = 0;
  for (const [tileKey, tile] of tiles) {
    if (tile.ownershipState !== "SETTLED") continue;
    const ownerId = tile.ownerId;
    if (!ownerId || ownerId.startsWith("barbarian-")) continue;
    const borderOwnerId = reachBorder.get(tileKey);
    if (borderOwnerId === undefined || borderOwnerId === ownerId) continue;
    mismatches += 1;
  }
  return mismatches;
};

const countSettled = (tiles: ReadonlyMap<string, BorderSeedTileView>): number => {
  let settled = 0;
  for (const [, tile] of tiles) if (tile.ownershipState === "SETTLED") settled += 1;
  return settled;
};

/**
 * Starts an out-of-reach-decay timer for every owned FRONTIER tile the
 * anchor-geometry replay left with no border slot AND no decay timer already
 * running -- the restart-only blind spot described in the module doc comment.
 * Mirrors `stampOutOfReachDecayInAnchorDisk`'s own per-tile eligibility
 * checks (not already decaying, not contested by 2+ live anchors) so a gap
 * tile is treated exactly like a tile that just lost a live anchor, not
 * granted anything a live loss wouldn't also get.
 *
 * Deliberately does NOT touch SETTLED tiles: decay only ever applies to
 * FRONTIER ground (see runtime-reach-out-of-reach.ts), and a SETTLED tile
 * with no border slot is a different, rarer case -- undefended but
 * unchallenged, since nobody's live anchor currently reaches it either -- not
 * covered by this pass.
 */
export const stampOwnedFrontierReachGapsForDecay = (deps: {
  tiles: ReadonlyMap<string, BorderSeedTileView>;
  reachBorder: () => ReadonlyMap<string, string>;
  gatherReachAnchors: () => ReachAnchor[];
  isLandTile?: LandConnectivityQuery;
  now: () => number;
  stampDecay: (tileKey: string, deadlineAt: number) => void;
}): number => {
  const border = deps.reachBorder();
  const anchors = deps.gatherReachAnchors();
  const nowMs = deps.now();
  let stamped = 0;
  for (const [tileKey, tile] of deps.tiles) {
    const ownerId = tile.ownerId;
    if (!ownerId || ownerId.startsWith("barbarian-")) continue;
    if (tile.ownershipState !== "FRONTIER") continue;
    if (tile.frontierDecayKind !== undefined) continue; // already decaying -- leave its existing deadline alone
    if (border.get(tileKey) === ownerId) continue; // anchor replay already covers it
    if (reachOwnerCountAt(tile.x, tile.y, anchors, deps.isLandTile) >= 2) continue; // actively contested, not undefended
    deps.stampDecay(tileKey, nowMs + OUT_OF_REACH_DECAY_MS);
    stamped += 1;
  }
  return stamped;
};

export type BorderSeedResult = {
  /** SETTLED tiles the seeding contest reverted to FRONTIER this boot. */
  unsettled: number;
  /** Invariant violations still standing afterwards. Expected to be 0. */
  mismatches: number;
  /** Owned FRONTIER tiles outside every current anchor's disk that stampOwnedFrontierReachGapsForDecay started decaying. */
  gapsStamped: number;
};

/**
 * Replays every live anchor into the persistent border, then reports what the
 * pass did. `reachBorder` is read through a getter because the caller
 * reassigns it on each activation.
 *
 * `unsettled` is the blast radius of a restart: undefended SETTLED ground
 * sitting inside a rival's reach is legal to take, and the boot contest
 * collects every such tile at once rather than one-per-live-event. On a world
 * carrying historical inconsistencies the first boot after this behaviour
 * lands can revert a batch of tiles, so the count is logged rather than left
 * to be discovered from player reports. Steady-state boots should log 0.
 */
export const seedReachBorderFromAnchors = (deps: {
  gatherReachAnchors: () => ReachAnchor[];
  applyReachAnchorActivation: (
    anchor: ReachAnchor,
    causeCommandId: string,
    options: { skipNeutralAutoClaim: true }
  ) => void;
  tiles: ReadonlyMap<string, BorderSeedTileView>;
  reachBorder: () => ReadonlyMap<string, string>;
  isLandTile?: LandConnectivityQuery;
  now: () => number;
  stampDecay: (tileKey: string, deadlineAt: number) => void;
  runtimeLogInfo: (payload: Record<string, unknown>, message: string) => void;
}): BorderSeedResult => {
  const settledBefore = countSettled(deps.tiles);
  for (const anchor of deps.gatherReachAnchors()) {
    deps.applyReachAnchorActivation(anchor, "world-init", { skipNeutralAutoClaim: true });
  }
  const unsettled = settledBefore - countSettled(deps.tiles);
  const mismatches = countBorderOwnershipMismatches(deps.tiles, deps.reachBorder());
  if (unsettled > 0) {
    deps.runtimeLogInfo(
      { unsettled, settledBefore },
      "[reachBorderSeed] reverted undefended SETTLED tiles inside a rival's reach to FRONTIER during border seeding"
    );
  }
  if (mismatches > 0) {
    deps.runtimeLogInfo(
      { mismatches },
      "[reachBorderSeed] SETTLED tiles still held against their reach-border owner after seeding — border/ownership invariant violated"
    );
  }
  // Run after the contest (and its diagnostics) so this can never be mistaken
  // for, or mask, an unsettle/mismatch the contest itself produced -- see
  // stampOwnedFrontierReachGapsForDecay's doc comment for why this is safe.
  const gapsStamped = stampOwnedFrontierReachGapsForDecay({
    tiles: deps.tiles,
    reachBorder: deps.reachBorder,
    gatherReachAnchors: deps.gatherReachAnchors,
    ...(deps.isLandTile ? { isLandTile: deps.isLandTile } : {}),
    now: deps.now,
    stampDecay: deps.stampDecay
  });
  if (gapsStamped > 0) {
    deps.runtimeLogInfo(
      { gapsStamped },
      "[reachBorderSeed] started an out-of-reach-decay timer for owned FRONTIER tiles outside every current anchor's disk"
    );
  }
  return { unsettled, mismatches, gapsStamped };
};
