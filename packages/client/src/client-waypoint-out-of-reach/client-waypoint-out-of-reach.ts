import type { ClientState, ClientWaypoint } from "../client-state/client-state.js";

/**
 * OUT_OF_REACH recovery for waypoints.
 *
 * The failure this exists to prevent: the server rejects an EXPAND with
 * OUT_OF_REACH, the client's waypoint planner re-plans, produces the exact
 * same step (its reach view disagreed with the server's — the very mismatch
 * client-reach-authoritative.ts now closes), and re-sends it. That alone would
 * be a bounded retry loop, but two things made it unbounded:
 *
 *  1. `topUpWaypointQueue`'s halt lives only in `waypoint.plan`, in memory.
 *  2. The waypoint queue is mirrored server-side (runtime-waypoint-queue.ts)
 *     and restored on every reconnect by restorePersistedWaypointQueueForPlayer,
 *     which deliberately resets `lastEnqueuedKey`/`consecutiveRetries`.
 *
 * So every socket reconnect restarted the retry count from zero against a step
 * that could never succeed, and no amount of refreshing cleared it — the queue
 * entry lived on the server. The head of the waypoint queue was wedged
 * permanently, blocking every waypoint behind it.
 *
 * The fix is to treat OUT_OF_REACH as terminal for that waypoint rather than
 * retryable: drop it locally AND cancel the server mirror, so a reconnect
 * cannot resurrect it. Reach only ever grows by building a town/outpost/dock,
 * which is a deliberate player action — so a step the server calls
 * out-of-reach will not spontaneously become legal, and retrying it is never
 * the right move.
 */

/** What {@link cancelWaypointsBlockedByOutOfReach} needs from its caller. */
export type WaypointOutOfReachDeps = {
  keyFor: (x: number, y: number) => string;
  pushFeed: (
    message: string,
    type?: "combat" | "mission" | "error" | "info" | "alliance" | "tech",
    severity?: "info" | "success" | "warn" | "error"
  ) => void;
  /** Mirrors the cancellation to the server so a reconnect cannot restore it. */
  sendGameMessage?: (payload: unknown) => boolean;
  waypointCancelWirePayload: (target: { x: number; y: number }) => Record<string, unknown>;
  persistWaypointQueue: (playerId: string, queue: readonly ClientWaypoint[]) => void;
};

/**
 * Cancels every waypoint whose route depends on `blockedTileKey` — the tile
 * the server just refused. That is the active waypoint when the rejected tile
 * is the step it last enqueued, plus any waypoint whose own destination IS the
 * refused tile (it can never be claimed, so it can never be reached).
 *
 * Returns the cancelled targets, so callers can log and tests can assert.
 */
export const cancelWaypointsBlockedByOutOfReach = (
  state: ClientState,
  blockedTileKey: string,
  deps: WaypointOutOfReachDeps
): Array<{ x: number; y: number }> => {
  if (!blockedTileKey) return [];
  const cancelled: Array<{ x: number; y: number }> = [];
  const survivors: ClientWaypoint[] = [];
  for (const waypoint of state.waypoint) {
    const targetKey = deps.keyFor(waypoint.target.x, waypoint.target.y);
    const blocksThisWaypoint = targetKey === blockedTileKey || waypoint.lastEnqueuedKey === blockedTileKey;
    if (!blocksThisWaypoint) {
      survivors.push(waypoint);
      continue;
    }
    cancelled.push(waypoint.target);
  }
  if (cancelled.length === 0) return [];
  state.waypoint = survivors;
  deps.persistWaypointQueue(state.me, state.waypoint);
  for (const target of cancelled) {
    // Cancel the durable server-side mirror too. Without this the entry
    // returns on the next reconnect and the loop restarts — the exact reason
    // a wedged waypoint previously survived refreshes and needed a new account.
    deps.sendGameMessage?.(deps.waypointCancelWirePayload(target));
  }
  // Clear the queued-target bookkeeping for the refused tile so a later,
  // legitimately-in-reach claim of the same tile is not silently suppressed
  // by a leftover key (enqueueTarget early-returns on a queued key).
  state.queuedTargetKeys.delete(blockedTileKey);
  state.actionQueue = state.actionQueue.filter((entry) => deps.keyFor(entry.x, entry.y) !== blockedTileKey);
  const label = cancelled.map((target) => `(${target.x}, ${target.y})`).join(", ");
  deps.pushFeed(
    `Waypoint ${label} cancelled: ${blockedTileKey} is outside your borders. Build a town or outpost closer to extend your reach.`,
    "info",
    "warn"
  );
  return cancelled;
};
