// Waypoint/expand-queue (server-durable storage) command handlers --
// extracted out of runtime.ts (already over the repo's per-file line cap),
// same context-object pattern as runtime-dev-queue-command-handlers.ts.
//
// tryDrainWaypointQueue below is the server-side auto-drain: it fires the
// same single-attempt-per-call pattern tryDrainDevQueue (runtime-dev-queue-
// command-handlers.ts) uses for BUILD/SETTLE, called from the same kind of
// completion hook (frontier-command lock resolution, via resolveLock in
// runtime-lock-resolution.ts) instead of settle/build completion. This runs
// from the simulation's own tick/lock-resolution timers, not anything gated
// on an active gateway connection, so it keeps walking the queue while the
// player is offline.
//
// Scope note: each attempt targets the queued (x, y) directly as a single
// EXPAND/ATTACK leg (origin auto-resolved the same way a manually-issued
// command resolves it in handleFrontierCommandImpl, via the actor's nearest
// owned-adjacent tile / dock / aether-bridge crossing). It does not replan a
// multi-hop route the way the client's planWaypoint does -- if the target
// isn't adjacent/reachable yet, the attempt is rejected like any other
// invalid entry and dropped (see tryDrainWaypointQueue's doc comment).
import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import type { DomainTileState, FrontierCommandType } from "@border-empires/game-domain";
import { DEV_QUEUE_SERVER_CAP } from "@border-empires/shared";
import {
  parseWaypointEnqueuePayload,
  parseWaypointTargetPayload,
  waypointQueueCancel,
  waypointQueueEnqueue
} from "./runtime-waypoint-queue.js";
import type { PlayerRuntimeSummary } from "./player-runtime-summary.js";
import type { FrontierCommandResult } from "./runtime-frontier-command.js";

export type RuntimeWaypointQueueCommandContext = {
  summaryForPlayer: (playerId: string) => PlayerRuntimeSummary;
  now: () => number;
  emitEvent: (event: SimulationEvent) => void;
  rejectCommand: (command: Pick<CommandEnvelope, "commandId" | "playerId">, code: string, message: string) => void;
  tileAt: (x: number, y: number) => DomainTileState | undefined;
  // True if targetOwnerId is a real, non-allied/truced owner other than
  // playerId -- i.e. this queued target needs an ATTACK, not an EXPAND.
  isHostileOwner: (playerId: string, targetOwnerId: string | undefined) => boolean;
  nextDrainCommandId: (playerId: string, x: number, y: number) => string;
  // Dispatches a single EXPAND/ATTACK the same way a manually-submitted one
  // would be (full validateFrontierCommand pass, same origin-resolution
  // fallback) -- returns whether it was accepted, and the rejection code
  // when it wasn't (so the drain loop can tell "not reachable yet" apart
  // from "genuinely dead"). Bypasses submitCommand entirely, same precedent
  // tryDrainDevQueue's doc comment explains for BUILD/SETTLE.
  dispatchFrontierCommand: (command: CommandEnvelope, actionType: FrontierCommandType) => FrontierCommandResult;
  // True while this player has a live, connected client -- an active client
  // already drives its own waypoint queue (client-queue-logic.ts's
  // topUpFromWaypoint), so the server's copy of the same hop would otherwise
  // race it for the same tile and lose almost every time (same-process sim
  // call vs. a network round trip). The drain below only runs at all when
  // this is false, i.e. purely as offline/disconnected continuation.
  isPlayerOnline: (playerId: string) => boolean;
};

export const handleWaypointEnqueueCommand = (context: RuntimeWaypointQueueCommandContext, command: CommandEnvelope): void => {
  const payload = parseWaypointEnqueuePayload(command.payloadJson);
  if (!payload) { context.rejectCommand(command, "BAD_COMMAND", "invalid command payload"); return; }
  const summary = context.summaryForPlayer(command.playerId);
  const { queue, accepted } = waypointQueueEnqueue(summary.waypointQueue, payload, context.now());
  summary.waypointQueue = queue;
  // TEMP DIAGNOSTIC (remove once the disappearing-waypoint bug is root-caused):
  // logs every enqueue attempt with the resulting queue length, so a live
  // `flyctl logs` grep on [waypoint-diag] can show whether the entry actually
  // lands in summary.waypointQueue and what isPlayerOnline reads at that moment.
  console.log("[waypoint-diag] enqueue", JSON.stringify({ playerId: command.playerId, commandId: command.commandId, target: payload, accepted, queueLenAfter: summary.waypointQueue.length, isOnline: context.isPlayerOnline(command.playerId) }));
  if (!accepted) {
    context.rejectCommand(command, "WAYPOINT_QUEUE_FULL", "waypoint queue is full or already contains this target");
    return;
  }
  context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
  // Mirrors handleDevQueueEnqueueCommand: try to act on it right away in case
  // the player has no in-flight frontier command blocking it, instead of
  // waiting on some unrelated future completion event to trigger the drain.
  tryDrainWaypointQueue(context, command.playerId);
};

export const handleWaypointCancelCommand = (context: RuntimeWaypointQueueCommandContext, command: CommandEnvelope): void => {
  const payload = parseWaypointTargetPayload(command.payloadJson);
  if (!payload) { context.rejectCommand(command, "BAD_COMMAND", "invalid command payload"); return; }
  const summary = context.summaryForPlayer(command.playerId);
  const before = summary.waypointQueue.length;
  summary.waypointQueue = waypointQueueCancel(summary.waypointQueue, payload);
  console.log("[waypoint-diag] cancel", JSON.stringify({ playerId: command.playerId, commandId: command.commandId, target: payload, before, after: summary.waypointQueue.length }));
  context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
};

export const handleWaypointCancelAllCommand = (context: RuntimeWaypointQueueCommandContext, command: CommandEnvelope): void => {
  const summary = context.summaryForPlayer(command.playerId);
  console.log("[waypoint-diag] cancel-all", JSON.stringify({ playerId: command.playerId, commandId: command.commandId, before: summary.waypointQueue.length }));
  summary.waypointQueue = [];
  context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
};

// Rejection codes that mean "not possible right now, but could become
// possible later without the player re-queuing" -- e.g. the target isn't
// adjacent to owned territory yet (a multi-hop route the client would have
// walked one EXPAND at a time), a lock/cooldown/muster shortfall that clears
// on its own, or a temporary supply cut-off. An entry rejected for one of
// these is put back at the front of the queue instead of dropped, so a
// queued-but-not-yet-reachable target survives to the next drain attempt
// (the next resolve or enqueue) instead of vanishing the first time the
// drain happens to touch it.
const RETRYABLE_WAYPOINT_DRAIN_CODES = new Set([
  "NOT_ADJACENT",
  "LOCKED",
  "ATTACK_COOLDOWN",
  "INSUFFICIENT_GOLD",
  "INSUFFICIENT_MANPOWER",
  "INSUFFICIENT_MUSTER",
  "SHIELDED",
  "ORIGIN_CUT_OFF"
]);

/**
 * Server-side auto-drain of the waypoint/expand queue. Called after any
 * EXPAND/ATTACK for this player resolves (win or lose -- resolveLock calls
 * this unconditionally once the lock is cleared, see runtime-lock-
 * resolution.ts) and right after an enqueue (above).
 *
 * Only actually drains while the player has no live client connected
 * (context.isPlayerOnline) -- an online client already walks its own
 * waypoint queue hop-by-hop (client-queue-logic.ts's topUpFromWaypoint), and
 * since this dispatches in-process while the client's equivalent command has
 * to make a network round trip, the two racing for the same tile is not a
 * fair race: the server side wins essentially every time, bouncing the
 * client's own attempt off a LOCKED/NOT_ADJACENT rejection on every single
 * hop. This drain exists purely so the queue keeps moving while nobody is
 * connected to drive it; a connected client is always the sole driver.
 *
 * Pops entries off the front one at a time, attempting a real EXPAND/ATTACK
 * dispatch for each (auto-resolving EXPAND vs. ATTACK from the target
 * tile's current owner -- barbarian/enemy-owned targets only drain as an
 * ATTACK when the entry was explicitly queued with trackBarbarian, or the
 * target is already barbarian-held, to avoid launching an unrequested war
 * against a rival just because they since settled the tile). A tile already
 * owned by this player (reached some other way while queued) is treated as
 * already-done and silently dropped, same as the client's own
 * restorePersistedWaypointQueueForPlayer skip.
 *
 * A rejection in RETRYABLE_WAYPOINT_DRAIN_CODES puts the entry back and stops
 * this drain call (see below) rather than dropping it -- this is still a
 * single-live-dispatch-per-call queue, not a retry-with-backoff one, it just
 * no longer treats "not reachable yet" as "never reachable." Any other
 * rejection (target genuinely invalid, barrier, not owned, ...) drops the
 * entry and the loop keeps trying subsequent entries (bounded by the queue's
 * own length) so one bad/stale entry can never permanently stall the rest.
 */
export const tryDrainWaypointQueue = (context: RuntimeWaypointQueueCommandContext, playerId: string): void => {
  if (context.isPlayerOnline(playerId)) {
    console.log("[waypoint-diag] drain-skip-online", JSON.stringify({ playerId }));
    return;
  }
  const summary = context.summaryForPlayer(playerId);
  console.log("[waypoint-diag] drain-start", JSON.stringify({ playerId, queueLen: summary.waypointQueue.length, targets: summary.waypointQueue.map((e) => e.target) }));
  const maxAttempts = Math.min(summary.waypointQueue.length, DEV_QUEUE_SERVER_CAP);
  // Entries this pass could not act on but which are NOT dead -- restored to
  // the front of the queue, in their original relative order, on every exit
  // path below. Deferring rather than dropping is the whole point: the
  // offline drain is a best-effort single-leg helper, and anything it cannot
  // do right now is still a waypoint the player expects to find waiting when
  // they log back in and their own client (which routes multi-hop, and can
  // attack) takes over again.
  const deferred: typeof summary.waypointQueue = [];
  const restoreDeferred = (): void => {
    if (deferred.length > 0) summary.waypointQueue = [...deferred, ...summary.waypointQueue];
  };
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (summary.waypointQueue.length === 0) break;
    const entry = summary.waypointQueue[0]!;
    summary.waypointQueue = summary.waypointQueue.slice(1);

    const target = context.tileAt(entry.target.x, entry.target.y);
    if (!target || target.ownerId === playerId) {
      console.log("[waypoint-diag] drain-drop-reached-or-gone", JSON.stringify({ playerId, target: entry.target, tileExists: Boolean(target), tileOwnerId: target?.ownerId }));
      continue; // gone, or already reached while queued
    }

    const isHostile = context.isHostileOwner(playerId, target.ownerId);
    const isBarbarianTarget = target.ownerId === "barbarian-1";
    if (isHostile && !entry.trackBarbarian && !isBarbarianTarget) {
      // Don't auto-declare war on a rival's settled tile -- but this is a
      // "not the server's call to make", not a dead entry. The player's own
      // client happily plans an ATTACK leg for exactly this target, so
      // dropping it here silently deleted a waypoint the player would have
      // walked themselves on reconnect.
      deferred.push(entry);
      continue;
    }
    const actionType: FrontierCommandType = isHostile ? "ATTACK" : "EXPAND";

    const nowMs = context.now();
    const cmd = {
      commandId: context.nextDrainCommandId(playerId, entry.target.x, entry.target.y),
      sessionId: "system-runtime:waypoint-queue",
      playerId,
      clientSeq: 0,
      issuedAt: nowMs,
      type: actionType,
      // fromX/fromY intentionally mirror the target: handleFrontierCommandImpl
      // resolves the actual origin itself (nearest owned-adjacent tile, dock,
      // or aether-bridge crossing) whenever the submitted origin isn't
      // actor-owned, same fallback a manually-issued command relies on.
      payloadJson: JSON.stringify({ fromX: entry.target.x, fromY: entry.target.y, toX: entry.target.x, toY: entry.target.y })
    } satisfies CommandEnvelope;

    const result = context.dispatchFrontierCommand(cmd, actionType);
    console.log("[waypoint-diag] drain-dispatch-result", JSON.stringify({ playerId, target: entry.target, actionType, accepted: result.accepted, code: result.code }));
    if (result.accepted) { restoreDeferred(); return; } // one live dispatch per drain call
    if (result.code && RETRYABLE_WAYPOINT_DRAIN_CODES.has(result.code)) {
      // Not reachable yet (not adjacent, locked, cooldown, short on
      // resources, cut off). Defer and keep going rather than stopping here,
      // so one not-yet-reachable entry can't block the rest of the queue.
      deferred.push(entry);
      continue;
    }
    // Genuinely dead (barrier, not owned, invalid target, ...) -- drop and keep going.
  }
  restoreDeferred();
};
