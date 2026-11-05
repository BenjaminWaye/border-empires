// Queued garrisons that wait for manpower instead of failing.
//
// A SETTLE enqueued while the player can't cover SETTLE_MANPOWER_COST is
// accepted anyway, flagged `awaitingManpower` and holding no reservation.
// Each passive-income tick (15s) checks waiting entries against the pool:
// once a manpower refill batch lands, entries are reserved strictly in queue
// order -- the same up-front hold a queued BUILD takes at enqueue (see
// runtime-dev-queue-build-reservation.ts) -- and only then become
// dispatchable. The client reads the per-entry flags off PLAYER_UPDATE and
// holds a waiting garrison in its own queue rather than dropping it.
import type { PlayerRuntimeSummary, ServerDevQueueEntry } from "./player-runtime-summary.js";
import type { RuntimeDevQueueCommandContext } from "./runtime-dev-queue-command-handlers.js";

/**
 * True when the queue holds a garrison waiting for manpower. Continuation
 * SETTLEs (unreserved, no flag) don't count: an online player's sits in the
 * queue for the whole settle timer, and the tick has nothing to do for it.
 */
export const hasAwaitingSettleEntry = (summary: Pick<PlayerRuntimeSummary, "devQueue">): boolean =>
  summary.devQueue.some((entry) => entry.awaitingManpower === true);

/**
 * Reserves manpower for `awaitingManpower` entries in queue order, stopping
 * at the first one the pool can't cover so a later garrison never jumps the
 * line. Returns how many entries were reserved.
 */
export const reserveAwaitingSettleManpower = (
  context: Pick<RuntimeDevQueueCommandContext, "summaryForPlayer" | "estimateSettleReservation" | "applyManpowerReservation">,
  playerId: string
): number => {
  const summary = context.summaryForPlayer(playerId);
  let reserved = 0;
  const queue = [...summary.devQueue];
  for (let index = 0; index < queue.length; index += 1) {
    const entry = queue[index]!;
    if (!entry.awaitingManpower) continue;
    const reservation = context.estimateSettleReservation(playerId);
    if (!reservation.ok) break;
    context.applyManpowerReservation(playerId, reservation.manpowerCost);
    const next: ServerDevQueueEntry = { ...entry, reservedManpower: reservation.manpowerCost };
    delete next.awaitingManpower;
    queue[index] = next;
    reserved += 1;
  }
  if (reserved > 0) summary.devQueue = queue;
  return reserved;
};
