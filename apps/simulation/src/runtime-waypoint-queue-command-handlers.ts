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
  // fallback) -- returns whether it was accepted. Bypasses submitCommand
  // entirely, same precedent tryDrainDevQueue's doc comment explains for
  // BUILD/SETTLE.
  dispatchFrontierCommand: (command: CommandEnvelope, actionType: FrontierCommandType) => boolean;
};

export const handleWaypointEnqueueCommand = (context: RuntimeWaypointQueueCommandContext, command: CommandEnvelope): void => {
  const payload = parseWaypointEnqueuePayload(command.payloadJson);
  if (!payload) { context.rejectCommand(command, "BAD_COMMAND", "invalid command payload"); return; }
  const summary = context.summaryForPlayer(command.playerId);
  const { queue, accepted } = waypointQueueEnqueue(summary.waypointQueue, payload, context.now());
  summary.waypointQueue = queue;
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
  summary.waypointQueue = waypointQueueCancel(summary.waypointQueue, payload);
  context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
};

export const handleWaypointCancelAllCommand = (context: RuntimeWaypointQueueCommandContext, command: CommandEnvelope): void => {
  const summary = context.summaryForPlayer(command.playerId);
  summary.waypointQueue = [];
  context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
};

/**
 * Server-side auto-drain of the waypoint/expand queue. Called after any
 * EXPAND/ATTACK for this player resolves (win or lose -- resolveLock calls
 * this unconditionally once the lock is cleared, see runtime-lock-
 * resolution.ts) and right after an enqueue (above).
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
 * Any other dispatch failure (target taken by someone else, no longer
 * adjacent, out of reach, insufficient manpower, ...) drops the entry too --
 * this is a single-attempt-per-entry queue, not a retry-with-backoff one,
 * matching tryDrainDevQueue's semantics for BUILD/SETTLE. The loop keeps
 * trying subsequent entries (bounded by the queue's own length) so one
 * bad/stale entry can never permanently stall the rest of the queue.
 */
export const tryDrainWaypointQueue = (context: RuntimeWaypointQueueCommandContext, playerId: string): void => {
  const summary = context.summaryForPlayer(playerId);
  const maxAttempts = Math.min(summary.waypointQueue.length, DEV_QUEUE_SERVER_CAP);
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (summary.waypointQueue.length === 0) return;
    const entry = summary.waypointQueue[0]!;
    summary.waypointQueue = summary.waypointQueue.slice(1);

    const target = context.tileAt(entry.target.x, entry.target.y);
    if (!target || target.ownerId === playerId) continue; // gone, or already reached while queued

    const isHostile = context.isHostileOwner(playerId, target.ownerId);
    const isBarbarianTarget = target.ownerId === "barbarian-1";
    if (isHostile && !entry.trackBarbarian && !isBarbarianTarget) continue; // don't auto-declare war on a rival's settled tile
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
    } as unknown as CommandEnvelope;

    if (context.dispatchFrontierCommand(cmd, actionType)) return; // one live dispatch per drain call
    // Rejected (no longer adjacent/reachable/taken/etc.) -- drop and keep going.
  }
};
