/**
 * Out-of-reach frontier decay — deadline queue, not a scan.
 *
 * A FRONTIER tile claimed (EXPAND) or captured (ATTACK) outside its owner's
 * reach gets a fixed OUT_OF_REACH_DECAY_MS deadline. When the deadline passes
 * the tile loses ownership, exactly like an encircled tile does today.
 *
 * ## Why a queue and not a sweep
 *
 * The previous frontier-decay mechanic (`updateFrontierDecay`, removed in
 * PR #627) iterated ALL frontier tiles for ALL players on every automation
 * tick and produced a 9-second synchronous block on the sim event loop. This
 * module must never reintroduce that cost, so it never scans the world:
 *
 * - Every stamp uses the *same* fixed window, so tiles enter the queue in
 *   monotonically non-decreasing deadline order. A FIFO with a head index is
 *   therefore already sorted — no heap, no re-sort, O(1) enqueue.
 * - A tick pops only entries that have actually come due (`deadlineAt <= now`)
 *   and stops at the first one that has not. Cost is O(tiles actually
 *   expiring), not O(frontier tiles) and not O(players).
 * - Cancellation (settled, reach caught up, owner changed, re-stamped) does
 *   NOT remove from the queue — that would be O(n). Entries are validated
 *   against live tile state when popped and silently dropped if stale, so
 *   cancellation is O(1) at the cancel site and costs nothing here.
 *
 * ## Bounds and gauges
 *
 * Per `docs/agents/state-and-persistence-discipline.md`, the queue carries its
 * own hard bound rather than relying on the indirect "entries drain within one
 * decay window" argument: `QUEUE_CAP` caps depth and `MAX_EXPIRIES_PER_TICK`
 * caps work per tick so a mass expiry spreads over ticks instead of blocking
 * the loop. Both emit a counter when they fire, and the depth is gauged.
 *
 * The queue is derived state — it is rebuilt at hydration from the tiles that
 * carry an OUT_OF_REACH deadline (see `rebuildOutOfReachDecayQueue`) and is
 * never serialized into a snapshot.
 */

import type { DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { FRONTIER_AUTO_HEAL_MS, reachOwnerCountAt, type LandConnectivityQuery, type ReachAnchor } from "@border-empires/shared";
import type { SimulationTileWireDelta } from "../runtime-types.js";

/**
 * Hard cap on queue depth. Sized well above any plausible legitimate load:
 * entries live at most one decay window, so this is only reachable if
 * out-of-reach claims arrive faster than they drain. Dropping the *new* entry
 * (rather than evicting an old one) fails open — the tile simply never
 * decays — which is the safe direction for a penalty mechanic.
 */
export const OUT_OF_REACH_DECAY_QUEUE_CAP = 100_000;

/**
 * Max tiles expired in a single tick. A burst beyond this is processed on
 * subsequent ticks; entries are already past their deadline and stay ordered,
 * so the only effect is a slightly late expiry, never a missed one. This is
 * the specific guard against PR #627's event-loop block.
 */
export const OUT_OF_REACH_DECAY_MAX_EXPIRIES_PER_TICK = 500;

/**
 * Compact the drained prefix once it is both sizeable and a majority of the
 * backing array, so `entries` cannot grow unboundedly from popped-but-retained
 * slots while still amortizing the splice cost.
 */
const COMPACTION_MIN_HEAD = 1_000;

export type OutOfReachDecayEntry = {
  tileKey: string;
  /** Must match the tile's `frontierDecayAt` exactly for the entry to be live. */
  deadlineAt: number;
};

export type OutOfReachDecayQueue = {
  entries: OutOfReachDecayEntry[];
  /** Index of the first not-yet-popped entry; everything before it is drained. */
  head: number;
};

export const createOutOfReachDecayQueue = (): OutOfReachDecayQueue => ({ entries: [], head: 0 });

/** Live (not yet drained) depth — gauge this, it grows with load. */
export const outOfReachDecayQueueDepth = (queue: OutOfReachDecayQueue): number =>
  queue.entries.length - queue.head;

export type OutOfReachDecayTickContext = {
  queue: OutOfReachDecayQueue;
  nowMs: number;
  tiles: Map<string, DomainTileState>;
  replaceTileState: (tileKey: string, tile: DomainTileState, commandId?: string) => void;
  tileDeltaFromState: (tile: DomainTileState) => SimulationTileWireDelta;
  emitEvent: (event: SimulationEvent) => void;
  runtimeLogInfo: (payload: Record<string, unknown>, message: string) => void;
  /** Every anchor currently live in the world — used to re-check reach coverage at expiry time. */
  gatherReachAnchors: () => ReachAnchor[];
  /** Land-gates the reach-coverage check the same way the real reach border is gated. */
  isLandTile?: LandConnectivityQuery;
  /** Registers the auto-heal deadline for a tile just cleared to neutral -- see runtime-frontier-auto-heal.ts. */
  registerFrontierAutoHeal: (tileKey: string, deadlineAt: number) => void;
};

/**
 * Records a decay deadline for `tileKey`. Callers must have already written
 * `frontierDecayAt: deadlineAt` / `frontierDecayKind: "OUT_OF_REACH"` onto the
 * tile — this only registers *when* to come back and look at it.
 */
export const enqueueOutOfReachDecay = (
  queue: OutOfReachDecayQueue,
  tileKey: string,
  deadlineAt: number,
  runtimeLogInfo?: (payload: Record<string, unknown>, message: string) => void
): void => {
  if (outOfReachDecayQueueDepth(queue) >= OUT_OF_REACH_DECAY_QUEUE_CAP) {
    runtimeLogInfo?.(
      { tileKey, depth: outOfReachDecayQueueDepth(queue), cap: OUT_OF_REACH_DECAY_QUEUE_CAP },
      "[outOfReachDecay] queue cap reached — dropping decay registration for this tile"
    );
    return;
  }
  queue.entries.push({ tileKey, deadlineAt });
};

/**
 * True when the queue entry still describes reality. Anything that cancels an
 * out-of-reach decay (settling, reach catching up, losing/changing owner, or a
 * fresh stamp with a new deadline) makes the entry stale by construction, so
 * no cancel path has to touch the queue itself.
 */
const isEntryLive = (tile: DomainTileState | undefined, entry: OutOfReachDecayEntry): boolean =>
  tile !== undefined &&
  tile.ownershipState === "FRONTIER" &&
  tile.frontierDecayKind === "OUT_OF_REACH" &&
  tile.frontierDecayAt === entry.deadlineAt;

/**
 * The cleared-tile shape used when a tile's decay expires. Mirrors the
 * cut-off branch of `applyEncirclement` so both decay causes leave a tile in
 * the same neutral state (ownership and every owner-scoped structure gone).
 *
 * naturalWonder is deliberately NOT cleared here: it's a fixed world-gen
 * feature, not a player-built structure, and survives losing an owner just
 * like it survives never having one -- clearing it here permanently erased
 * wonders that were claimed but decayed before being settled (#see natural
 * wonders disappearing after EXPAND capture).
 */
const clearedTile = (tile: DomainTileState, healAt: number): DomainTileState => ({
  ...tile,
  ownerId: undefined,
  ownershipState: undefined,
  frontierDecayAt: undefined,
  frontierDecayKind: undefined,
  fort: undefined,
  observatory: undefined,
  siegeOutpost: undefined,
  economicStructure: undefined,
  muster: undefined,
  sabotage: undefined,
  healAt
});

/**
 * Expires every tile whose out-of-reach deadline has passed, up to this tick's
 * work cap. Returns the number of tiles actually expired.
 */
export const tickOutOfReachDecay = (context: OutOfReachDecayTickContext): number => {
  const { queue, nowMs, tiles } = context;
  const tileDeltasByOwner = new Map<string, SimulationTileWireDelta[]>();
  let expired = 0;
  let examined = 0;

  while (queue.head < queue.entries.length && expired < OUT_OF_REACH_DECAY_MAX_EXPIRIES_PER_TICK) {
    const entry = queue.entries[queue.head]!;
    // Deadlines are monotonically non-decreasing (fixed window), so the first
    // future entry means nothing behind it is due either.
    if (entry.deadlineAt > nowMs) break;
    queue.head += 1;
    examined += 1;

    const tile = tiles.get(entry.tileKey);
    if (!isEntryLive(tile, entry)) continue; // stale: cancelled or re-stamped
    const liveTile = tile as DomainTileState;

    // Re-check reach coverage at the moment of expiry, not just at claim time.
    // A tile sitting inside ANY player's live reach — the owner's own (reach
    // caught up but the activation-time cancel in
    // cancelOutOfReachDecayInAnchorDisk missed it, e.g. a different anchor)
    // or another player's (contested ground someone is actively holding) — is
    // not genuine no-man's-land, so it should not decay. Clear the timer
    // instead of expiring so the tile reads as protected rather than
    // perpetually "about to decay".
    if (reachOwnerCountAt(liveTile.x, liveTile.y, context.gatherReachAnchors(), context.isLandTile) >= 1) {
      const protectedTile: DomainTileState = {
        ...liveTile,
        frontierDecayAt: undefined,
        frontierDecayKind: undefined
      };
      context.replaceTileState(entry.tileKey, protectedTile, `out-of-reach-decay-protected:${nowMs}`);
      continue;
    }

    const cleared = clearedTile(liveTile, nowMs + FRONTIER_AUTO_HEAL_MS);
    const ownerId = (tile as DomainTileState).ownerId;
    context.replaceTileState(entry.tileKey, cleared, `out-of-reach-decay:${nowMs}`);
    context.registerFrontierAutoHeal(entry.tileKey, cleared.healAt!);
    expired += 1;
    if (ownerId) {
      const deltas = tileDeltasByOwner.get(ownerId);
      if (deltas) deltas.push(context.tileDeltaFromState(cleared));
      else tileDeltasByOwner.set(ownerId, [context.tileDeltaFromState(cleared)]);
    }
  }

  for (const [playerId, tileDeltas] of tileDeltasByOwner) {
    context.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId: `out-of-reach-decay:${nowMs}`,
      playerId,
      tileDeltas
    });
  }

  if (expired >= OUT_OF_REACH_DECAY_MAX_EXPIRIES_PER_TICK) {
    context.runtimeLogInfo(
      { expired, examined, depth: outOfReachDecayQueueDepth(queue), cap: OUT_OF_REACH_DECAY_MAX_EXPIRIES_PER_TICK },
      "[outOfReachDecay] per-tick expiry cap reached — remainder deferred to next tick"
    );
  }

  // Reclaim the drained prefix once it dominates the backing array.
  if (queue.head >= COMPACTION_MIN_HEAD && queue.head * 2 >= queue.entries.length) {
    queue.entries.splice(0, queue.head);
    queue.head = 0;
  }

  return expired;
};

/**
 * Rebuilds the queue from tile state. Used at hydration/boot, where the queue
 * (derived state, never snapshotted) has to be reconstructed from the tiles
 * that still carry an OUT_OF_REACH deadline. O(tiles) once at startup, in line
 * with the other index rebuilds on that path — never call this per tick.
 */
export const rebuildOutOfReachDecayQueue = (
  tiles: ReadonlyMap<string, DomainTileState>
): OutOfReachDecayQueue => {
  const entries: OutOfReachDecayEntry[] = [];
  for (const [tileKey, tile] of tiles) {
    if (tile.ownershipState !== "FRONTIER") continue;
    if (tile.frontierDecayKind !== "OUT_OF_REACH") continue;
    if (typeof tile.frontierDecayAt !== "number") continue;
    entries.push({ tileKey, deadlineAt: tile.frontierDecayAt });
  }
  // Hydrated tiles come from an unordered map, so restore the deadline
  // ordering the tick loop's early-break relies on.
  entries.sort((a, b) => a.deadlineAt - b.deadlineAt);
  return { entries, head: 0 };
};
