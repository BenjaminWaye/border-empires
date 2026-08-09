// Dev-queue (server-durable) command handlers -- extracted out of runtime.ts
// (which is already over the repo's per-file line cap) following the same
// context-object pattern as runtime-structure-command-handlers.ts and
// runtime-frontier-command.ts. See runtime-dev-queue.ts for the pure
// enqueue/cancel/move-to-front array ops this delegates to.
import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import {
  devQueueCancel,
  devQueueEnqueue,
  devQueueMoveToFront,
  parseDevQueueEnqueuePayload,
  parseDevQueueTileKeyPayload
} from "./runtime-dev-queue.js";
import type { PlayerRuntimeSummary } from "./player-runtime-summary.js";

export type RuntimeDevQueueCommandContext = {
  summaryForPlayer: (playerId: string) => PlayerRuntimeSummary;
  now: () => number;
  emitEvent: (event: SimulationEvent) => void;
  rejectCommand: (command: Pick<CommandEnvelope, "commandId" | "playerId">, code: string, message: string) => void;
  hasAvailableDevelopmentSlot: (playerId: string) => boolean;
  nextDrainCommandId: (playerId: string, tileKey: string) => string;
  dispatchSettle: (command: CommandEnvelope) => void;
  dispatchBuild: (command: CommandEnvelope) => void;
  dispatchRemoveStructure: (command: CommandEnvelope) => void;
};

export const handleDevQueueEnqueueCommand = (context: RuntimeDevQueueCommandContext, command: CommandEnvelope): void => {
  const payload = parseDevQueueEnqueuePayload(command.payloadJson);
  if (!payload) { context.rejectCommand(command, "BAD_COMMAND", "invalid command payload"); return; }
  const summary = context.summaryForPlayer(command.playerId);
  const { queue, accepted } = devQueueEnqueue(summary.devQueue, payload, context.now());
  summary.devQueue = queue;
  if (!accepted) {
    context.rejectCommand(command, "DEV_QUEUE_FULL", "dev queue is full or already contains this tile");
    return;
  }
  context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
  tryDrainDevQueue(context, command.playerId);
};

export const handleDevQueueCancelCommand = (context: RuntimeDevQueueCommandContext, command: CommandEnvelope): void => {
  const payload = parseDevQueueTileKeyPayload(command.payloadJson);
  if (!payload) { context.rejectCommand(command, "BAD_COMMAND", "invalid command payload"); return; }
  const summary = context.summaryForPlayer(command.playerId);
  summary.devQueue = devQueueCancel(summary.devQueue, payload.tileKey);
  context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
};

export const handleDevQueueMoveToFrontCommand = (context: RuntimeDevQueueCommandContext, command: CommandEnvelope): void => {
  const payload = parseDevQueueTileKeyPayload(command.payloadJson);
  if (!payload) { context.rejectCommand(command, "BAD_COMMAND", "invalid command payload"); return; }
  const summary = context.summaryForPlayer(command.playerId);
  summary.devQueue = devQueueMoveToFront(summary.devQueue, payload.tileKey);
  context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
};

/**
 * Attempts exactly one dispatch, mirroring the client's own
 * processDevelopmentQueue (also single-attempt per call) -- called only from
 * the specific points a development slot can actually free up, never from a
 * timer (see the plan doc's performance section).
 *
 * Dispatch bypasses submitCommand entirely (same precedent as
 * Runtime.runAiAutoSettleForPlayer, which calls startSettlementProcess
 * directly): routing a system-originated, never-persisted CommandEnvelope
 * through submitCommand would compete with the real player's own clientSeq
 * numberspace for dedup/replay, which only AI/barbarian player ids (with no
 * independent human writer) can safely do. Calling the handler impls
 * directly skips that hazard entirely while still reusing their full
 * validation/application logic.
 */
export const tryDrainDevQueue = (context: RuntimeDevQueueCommandContext, playerId: string): void => {
  const summary = context.summaryForPlayer(playerId);
  if (summary.devQueue.length === 0) return;
  if (!context.hasAvailableDevelopmentSlot(playerId)) return;
  const entry = summary.devQueue[0]!;
  summary.devQueue = summary.devQueue.slice(1);
  const nowMs = context.now();
  const isRemoval = entry.kind === "BUILD" && entry.structureType === "REMOVE_STRUCTURE";
  // "BUILD_STRUCTURE" is the internal normalized build type (see
  // Runtime.normalizeLegacyBuildCommand) -- not part of CommandEnvelope's
  // public wire-type union, so it needs the same `as unknown as
  // CommandEnvelope` escape hatch normalizeLegacyBuildCommand itself uses.
  const cmd = {
    commandId: context.nextDrainCommandId(playerId, entry.tileKey),
    sessionId: "system-runtime:dev-queue",
    playerId,
    clientSeq: 0,
    issuedAt: nowMs,
    type: entry.kind === "SETTLE" ? "SETTLE" : isRemoval ? "REMOVE_STRUCTURE" : "BUILD_STRUCTURE",
    payloadJson: JSON.stringify(
      entry.kind === "BUILD" && entry.structureType && !isRemoval
        ? { x: entry.x, y: entry.y, structureType: entry.structureType }
        : { x: entry.x, y: entry.y }
    )
  } as unknown as CommandEnvelope;
  if (entry.kind === "SETTLE") {
    context.dispatchSettle(cmd);
  } else if (isRemoval) {
    context.dispatchRemoveStructure(cmd);
  } else {
    context.dispatchBuild(cmd);
  }
};
