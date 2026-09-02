/**
 * Frontier auto-heal — deadline queue, not a scan.
 *
 * A FRONTIER tile that reverts to neutral (out-of-reach decay or encirclement
 * cut-off) is stamped with `healAt: now + FRONTIER_AUTO_HEAL_MS`. When that
 * deadline passes, if the tile is STILL neutral AND still sits inside some
 * owner's persistent reach border right now, it's re-granted FRONTIER for
 * that owner -- free and instant, same as the reach-driven auto-claim in
 * runtime-reach-border-apply.ts. If nobody currently covers it, the entry is
 * just dropped: should reach ever reach the tile later, the auto-claim path
 * picks it up immediately on its own, so there's nothing to reschedule here.
 *
 * ## Why a queue and not a sweep
 *
 * Mirrors runtime-out-of-reach-decay.ts exactly, for the same reason: a
 * per-tick scan over every neutral tile (up to 202,500 tiles on the largest
 * maps) to find the ones due for healing would be O(world), and the previous
 * frontier-decay sweep this codebase once shipped caused a 9-second
 * synchronous block (PR #627). This module must never reintroduce that cost:
 *
 * - Every stamp uses the same fixed window, so entries arrive in
 *   monotonically non-decreasing deadline order -- a FIFO with a head index
 *   is already sorted, no heap, no re-sort, O(1) enqueue.
 * - A tick pops only entries that have actually come due (`deadlineAt <=
 *   now`) and stops at the first one that hasn't. Cost is O(tiles actually
 *   due), never O(neutral tiles) and never O(map size).
 * - Cancellation (re-claimed, re-stamped) does NOT remove from the queue --
 *   entries are validated against live tile state when popped and silently
 *   dropped if stale, so cancellation is O(1) at the cancel site.
 *
 * Per docs/agents/state-and-persistence-discipline.md the queue carries its
 * own hard bound (QUEUE_CAP) and a per-tick work cap (MAX_HEALS_PER_TICK), and
 * is derived state -- rebuilt at hydration from tiles carrying a `healAt`
 * stamp, never snapshotted directly.
 */

import type { DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import type { SimulationTileWireDelta } from "../runtime-types.js";

/** Hard cap on queue depth -- dropping a new entry just means that tile never gets a scheduled heal (it can still be picked up instantly if reach later grows onto it). */
export const FRONTIER_AUTO_HEAL_QUEUE_CAP = 100_000;

/** Max tiles healed/examined in a single tick -- the specific guard against a mass-destruction event (e.g. a big encirclement cut-off) reintroducing a synchronous block. */
export const FRONTIER_AUTO_HEAL_MAX_PER_TICK = 500;

const COMPACTION_MIN_HEAD = 1_000;

export type FrontierAutoHealEntry = { tileKey: string; deadlineAt: number };

export type FrontierAutoHealQueue = { entries: FrontierAutoHealEntry[]; head: number };

export const createFrontierAutoHealQueue = (): FrontierAutoHealQueue => ({ entries: [], head: 0 });

/** Live (not yet drained) depth -- gauge this. */
export const frontierAutoHealQueueDepth = (queue: FrontierAutoHealQueue): number => queue.entries.length - queue.head;

/**
 * Records a heal deadline for `tileKey`. Caller must have already written
 * `healAt: deadlineAt` onto the (now-neutral) tile -- this only registers
 * *when* to come back and look at it.
 */
export const enqueueFrontierAutoHeal = (
  queue: FrontierAutoHealQueue,
  tileKey: string,
  deadlineAt: number,
  runtimeLogInfo?: (payload: Record<string, unknown>, message: string) => void
): void => {
  if (frontierAutoHealQueueDepth(queue) >= FRONTIER_AUTO_HEAL_QUEUE_CAP) {
    runtimeLogInfo?.(
      { tileKey, depth: frontierAutoHealQueueDepth(queue), cap: FRONTIER_AUTO_HEAL_QUEUE_CAP },
      "[frontierAutoHeal] queue cap reached — dropping heal registration for this tile"
    );
    return;
  }
  queue.entries.push({ tileKey, deadlineAt });
};

const isEntryLive = (tile: DomainTileState | undefined, entry: FrontierAutoHealEntry): boolean =>
  tile !== undefined && tile.ownerId === undefined && tile.healAt === entry.deadlineAt;

export type FrontierAutoHealTickContext = {
  queue: FrontierAutoHealQueue;
  nowMs: number;
  tiles: Map<string, DomainTileState>;
  replaceTileState: (tileKey: string, tile: DomainTileState, commandId?: string) => void;
  tileDeltaFromState: (tile: DomainTileState) => SimulationTileWireDelta;
  emitEvent: (event: SimulationEvent) => void;
  runtimeLogInfo: (payload: Record<string, unknown>, message: string) => void;
  /** O(1) persistent-border lookup -- same map `isInReach`/EXPAND use. */
  reachBorderOwnerAt: (x: number, y: number) => string | undefined;
};

/** Heals every tile whose auto-heal deadline has passed, up to this tick's work cap. Returns the number actually healed. */
export const tickFrontierAutoHeal = (context: FrontierAutoHealTickContext): number => {
  const { queue, nowMs, tiles } = context;
  const tileDeltasByOwner = new Map<string, SimulationTileWireDelta[]>();
  let healed = 0;
  let examined = 0;

  while (queue.head < queue.entries.length && healed < FRONTIER_AUTO_HEAL_MAX_PER_TICK) {
    const entry = queue.entries[queue.head]!;
    if (entry.deadlineAt > nowMs) break; // monotonically non-decreasing: nothing behind this is due either
    queue.head += 1;
    examined += 1;

    const tile = tiles.get(entry.tileKey);
    if (!isEntryLive(tile, entry)) continue; // stale: re-claimed or re-stamped since
    const liveTile = tile as DomainTileState;

    const ownerId = context.reachBorderOwnerAt(liveTile.x, liveTile.y);
    if (!ownerId) {
      // Nobody currently covers this ground -- drop the stamp. If reach ever
      // grows onto it later, the reach-driven auto-claim path grants it
      // immediately on its own; there is nothing to reschedule here.
      const cleared: DomainTileState = { ...liveTile, healAt: undefined };
      context.replaceTileState(entry.tileKey, cleared, `frontier-auto-heal-skip:${nowMs}`);
      continue;
    }

    const healedTile: DomainTileState = { ...liveTile, ownerId, ownershipState: "FRONTIER", healAt: undefined };
    context.replaceTileState(entry.tileKey, healedTile, `frontier-auto-heal:${nowMs}`);
    healed += 1;
    const deltas = tileDeltasByOwner.get(ownerId);
    if (deltas) deltas.push(context.tileDeltaFromState(healedTile));
    else tileDeltasByOwner.set(ownerId, [context.tileDeltaFromState(healedTile)]);
  }

  for (const [playerId, tileDeltas] of tileDeltasByOwner) {
    context.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId: `frontier-auto-heal:${nowMs}`, playerId, tileDeltas });
  }

  if (healed >= FRONTIER_AUTO_HEAL_MAX_PER_TICK) {
    context.runtimeLogInfo(
      { healed, examined, depth: frontierAutoHealQueueDepth(queue), cap: FRONTIER_AUTO_HEAL_MAX_PER_TICK },
      "[frontierAutoHeal] per-tick cap reached — remainder deferred to next tick"
    );
  }

  if (queue.head >= COMPACTION_MIN_HEAD && queue.head * 2 >= queue.entries.length) {
    queue.entries.splice(0, queue.head);
    queue.head = 0;
  }

  return healed;
};

/** Rebuilds the queue from tile state at hydration/boot. O(tiles) once at startup -- never call this per tick. */
export const rebuildFrontierAutoHealQueue = (tiles: ReadonlyMap<string, DomainTileState>): FrontierAutoHealQueue => {
  const entries: FrontierAutoHealEntry[] = [];
  for (const [tileKey, tile] of tiles) {
    if (tile.ownerId !== undefined) continue;
    if (typeof tile.healAt !== "number") continue;
    entries.push({ tileKey, deadlineAt: tile.healAt });
  }
  entries.sort((a, b) => a.deadlineAt - b.deadlineAt);
  return { entries, head: 0 };
};
