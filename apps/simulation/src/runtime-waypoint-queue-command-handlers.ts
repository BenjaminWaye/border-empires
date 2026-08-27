// Waypoint/expand-queue (server-durable storage) command handlers --
// extracted out of runtime.ts (already over the repo's per-file line cap),
// same context-object pattern as runtime-dev-queue-command-handlers.ts.
//
// The offline auto-drain itself (tryDrainWaypointQueue) now lives in
// runtime-waypoint-drain/ -- split out once it grew a full client-plan
// replay loop (see docs/waypoint-client-planning-plan.md), which would have
// pushed this file over the repo's per-file line cap. Re-exported here for
// callers that imported it from this module's old location.
import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import type { DomainTileState, FrontierCommandType } from "@border-empires/game-domain";
import {
  parseWaypointEnqueuePayload,
  parseWaypointTargetPayload,
  waypointQueueCancel,
  waypointQueueEnqueue
} from "./runtime-waypoint-queue.js";
import type { PlayerRuntimeSummary } from "./player-runtime-summary.js";
import type { FrontierCommandResult } from "./runtime-frontier-command.js";
import { tryDrainWaypointQueue, type RuntimeWaypointDrainContext } from "./runtime-waypoint-drain/runtime-waypoint-drain.js";

export { tryDrainWaypointQueue };

export type RuntimeWaypointQueueCommandContext = RuntimeWaypointDrainContext & {
  summaryForPlayer: (playerId: string) => PlayerRuntimeSummary;
  now: () => number;
  emitEvent: (event: SimulationEvent) => void;
  rejectCommand: (command: Pick<CommandEnvelope, "commandId" | "playerId">, code: string, message: string) => void;
  tileAt: (x: number, y: number) => DomainTileState | undefined;
  isHostileOwner: (playerId: string, targetOwnerId: string | undefined) => boolean;
  nextDrainCommandId: (playerId: string, x: number, y: number) => string;
  dispatchFrontierCommand: (command: CommandEnvelope, actionType: FrontierCommandType) => FrontierCommandResult;
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

