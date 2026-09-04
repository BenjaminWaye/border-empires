/**
 * The reach half of out-of-reach frontier decay (the timer/expiry half lives
 * in runtime-out-of-reach-decay.ts).
 *
 * Two responsibilities, both deliberately scoped to a single tile or a single
 * anchor's disk so neither can reintroduce the world-wide sweep that PR #627
 * removed:
 *
 * - `outOfReachDecayDeadline` — decides, at command-resolution time, whether a
 *   just-claimed FRONTIER tile decays. O(anchors) for one tile.
 * - `cancelOutOfReachDecayInAnchorDisk` — the "reach caught up" cancellation,
 *   run when a new anchor activates. O(radius²) over that anchor's own disk.
 */

import type { DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { OUT_OF_REACH_DECAY_MS, reachOwnerCountAt, tileKeysInReach, type LandConnectivityQuery, type ReachAnchor } from "@border-empires/shared";
import type { SimulationTileWireDelta } from "../runtime-types.js";

export type OutOfReachDecayReachContext = {
  /** True when the tile is inside this player's persistent ownership border. */
  isPlayerTileInReach: (playerId: string, x: number, y: number) => boolean;
  /** Every anchor currently live in the world. */
  gatherReachAnchors: () => ReachAnchor[];
  now: () => number;
  /** Land-gates the contested-zone check the same way the real reach border is gated (see reach.ts's landGatedTileKeysInDisk). */
  isLandTile?: LandConnectivityQuery;
};

/**
 * The decay deadline for a FRONTIER tile `playerId` just took at (x, y), or
 * undefined when the tile should not decay at all.
 *
 * Two exemptions:
 * - The tile is already inside the player's own reach — ordinary expansion.
 * - The tile sits in an actively contested reach zone (2+ players' live
 *   anchors overlap it). Fighting over a shared border is the intended way to
 *   take ground off someone; only pushing into genuine no-man's-land carries
 *   the holding penalty.
 */
export const outOfReachDecayDeadline = (
  context: OutOfReachDecayReachContext,
  playerId: string,
  x: number,
  y: number
): number | undefined => {
  if (context.isPlayerTileInReach(playerId, x, y)) return undefined;
  if (reachOwnerCountAt(x, y, context.gatherReachAnchors(), context.isLandTile) >= 2) return undefined;
  return context.now() + OUT_OF_REACH_DECAY_MS;
};

export type OutOfReachDecayCancelContext = {
  tiles: Map<string, DomainTileState>;
  replaceTileState: (tileKey: string, tile: DomainTileState, commandId?: string) => void;
  tileDeltaFromState: (tile: DomainTileState) => SimulationTileWireDelta;
  emitEvent: (event: SimulationEvent) => void;
  /** Land-gates the disk the same way the real reach border is gated. */
  isLandTile?: LandConnectivityQuery;
};

export type OutOfReachDecayStampContext = OutOfReachDecayCancelContext & {
  now: () => number;
  /** Every anchor currently live in the world. Caller must gather this AFTER the deactivation has already been applied to tile/anchor state. */
  gatherReachAnchors: () => ReachAnchor[];
  /** True when (x, y) is inside `playerId`'s persistent ownership border. Caller must build this from the border AFTER the deactivation has been applied -- see stampOutOfReachDecayInAnchorDisk's doc comment. Same check outOfReachDecayDeadline uses at claim time. */
  isPlayerTileInReach: (playerId: string, x: number, y: number) => boolean;
  registerOutOfReachDecay: (tileKey: string, deadlineAt: number) => void;
};

/**
 * Clears the out-of-reach decay timer on every FRONTIER/OUT_OF_REACH tile
 * inside the activating anchor's disk, regardless of who owns the tile.
 *
 * The anchor's own owner's tiles are the "reach caught up" case: the ground
 * is now theirs to hold. A tile some OTHER player owns can also sit in this
 * disk (e.g. an ATTACK capture, never reach-gated) — this anchor activating
 * makes that spot actively contested (this anchor's live reach now overlaps
 * it), which is exactly the exemption `outOfReachDecayDeadline` grants at
 * claim time and `tickOutOfReachDecay` re-grants at expiry time via
 * `reachOwnerCountAt(...) >= 1`. Without clearing it here too, a tile that
 * started decaying before this anchor activated keeps visibly counting down
 * (and pulsing on the client) for the rest of its window even though it is
 * now protected ground — only getting corrected if it happens to still be
 * live when the queue pops it. Clearing eagerly here keeps the client's view
 * (which just renders whatever frontierDecayAt/Kind the tile carries) honest
 * the moment reach — anyone's — catches up, not just at eventual expiry.
 *
 * Only touches FRONTIER tiles carrying an OUT_OF_REACH timer. Tiles are left
 * alone otherwise; in particular this never revives a tile that already
 * expired, and it never interferes with encirclement, which takes effect
 * instantly and sets no timer at all.
 *
 * The queue entry for a cleared tile is intentionally not removed — it goes
 * stale by construction and is dropped when popped (see
 * runtime-out-of-reach-decay.ts), which keeps cancellation O(1) per tile.
 */
export const cancelOutOfReachDecayInAnchorDisk = (
  context: OutOfReachDecayCancelContext,
  anchor: ReachAnchor,
  causeCommandId: string
): number => {
  const tileDeltasByOwner = new Map<string, SimulationTileWireDelta[]>();
  let cleared = 0;
  for (const tileKey of tileKeysInReach(anchor, context.isLandTile)) {
    const tile = context.tiles.get(tileKey);
    if (!tile?.ownerId) continue;
    if (tile.ownershipState !== "FRONTIER") continue;
    if (tile.frontierDecayKind !== "OUT_OF_REACH") continue;
    const updated: DomainTileState = {
      ...tile,
      frontierDecayAt: undefined,
      frontierDecayKind: undefined
    };
    context.replaceTileState(tileKey, updated, causeCommandId);
    cleared += 1;
    const delta = context.tileDeltaFromState(updated);
    const existing = tileDeltasByOwner.get(tile.ownerId);
    if (existing) existing.push(delta);
    else tileDeltasByOwner.set(tile.ownerId, [delta]);
  }
  for (const [playerId, tileDeltas] of tileDeltasByOwner) {
    context.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId: causeCommandId,
      playerId,
      tileDeltas
    });
  }
  return cleared;
};

/**
 * Mirror of `cancelOutOfReachDecayInAnchorDisk`, inverted: stamps a fresh
 * out-of-reach decay deadline onto tiles that just lost coverage because
 * `anchor` deactivated (Relay Beacon disabled/destroyed, Siege Outpost lost,
 * town/dock lost).
 *
 * Without this, a FRONTIER tile that was claimed *inside* reach — so it
 * never got a deadline at claim time — sat with `frontierDecayKind:
 * undefined` forever once the anchor that covered it went away: nothing else
 * ever re-evaluates an already-owned tile's reach coverage, since the queue
 * only pops entries that were enqueued, and enqueue only ever happened once,
 * at claim time (see runtime-out-of-reach-decay.ts's module doc for why
 * there is deliberately no world sweep). This closes that gap the same way
 * `cancelOutOfReachDecayInAnchorDisk` closes the opposite one: scoped to the
 * one anchor's own disk, O(radius²), never a sweep.
 *
 * Evaluated per TILE OWNER, not per the deactivating anchor's owner: the
 * anchor's disk can hold tiles a *different* player owns (e.g. an ATTACK
 * capture, which is never reach-gated) whose contest count -- shared reach
 * from this anchor plus a rival's -- just dropped from 2 to 1 as a direct
 * result of this deactivation. Restricting to `tile.ownerId === anchor.ownerId`
 * would leave exactly those tiles stuck the same way this function exists to
 * prevent. Barbarian tiles are excluded (never reach-gated, same as at claim
 * time -- see the barbarian-1 check in runtime-lock-resolution.ts).
 *
 * Only touches FRONTIER tiles that don't already carry a decay timer (a tile
 * already decaying, for either reason, is left alone — re-stamping it here
 * would just reset its deadline). `context.gatherReachAnchors` and
 * `context.isPlayerTileInReach` must both be built from state that already
 * reflects this deactivation, so the coverage check below reflects the
 * post-deactivation world, not the moment before.
 */
export const stampOutOfReachDecayInAnchorDisk = (
  context: OutOfReachDecayStampContext,
  anchor: ReachAnchor,
  causeCommandId: string
): number => {
  const tileDeltasByOwner = new Map<string, SimulationTileWireDelta[]>();
  const anchors = context.gatherReachAnchors();
  const nowMs = context.now();
  let stamped = 0;
  for (const tileKey of tileKeysInReach(anchor, context.isLandTile)) {
    const tile = context.tiles.get(tileKey);
    if (!tile?.ownerId || tile.ownerId === "barbarian-1") continue;
    if (tile.ownershipState !== "FRONTIER") continue;
    if (tile.frontierDecayKind !== undefined) continue; // already decaying (either kind) -- leave its existing deadline alone
    // Same exemptions outOfReachDecayDeadline applies at claim time, checked
    // against the TILE's own owner: still inside that owner's own
    // (post-deactivation) persistent reach, or sitting in actively contested
    // ground shared by 2+ live anchors.
    if (context.isPlayerTileInReach(tile.ownerId, tile.x, tile.y)) continue;
    if (reachOwnerCountAt(tile.x, tile.y, anchors, context.isLandTile) >= 2) continue;
    const deadlineAt = nowMs + OUT_OF_REACH_DECAY_MS;
    const stampedTile: DomainTileState = {
      ...tile,
      frontierDecayAt: deadlineAt,
      frontierDecayKind: "OUT_OF_REACH"
    };
    context.replaceTileState(tileKey, stampedTile, causeCommandId);
    context.registerOutOfReachDecay(tileKey, deadlineAt);
    stamped += 1;
    const delta = context.tileDeltaFromState(stampedTile);
    const existing = tileDeltasByOwner.get(tile.ownerId);
    if (existing) existing.push(delta);
    else tileDeltasByOwner.set(tile.ownerId, [delta]);
  }
  for (const [playerId, tileDeltas] of tileDeltasByOwner) {
    context.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId: causeCommandId,
      playerId,
      tileDeltas
    });
  }
  return stamped;
};
