// Dev-queue (server-durable) command handlers -- extracted out of runtime.ts
// (which is already over the repo's per-file line cap) following the same
// context-object pattern as runtime-structure-command-handlers.ts and
// runtime-frontier-command.ts. See runtime-dev-queue.ts for the pure
// enqueue/cancel/move-to-front array ops this delegates to, and
// runtime-dev-queue-build-reservation.ts for the MP/slot reservation logic
// a BUILD entry now holds while queued (§ queued-buildings-mp-reimbursement).
import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import {
  devQueueCancel,
  devQueueEnqueue,
  devQueueEntryForTileKey,
  devQueueMoveToFront,
  parseDevQueueEnqueuePayload,
  parseDevQueueTileKeyPayload
} from "./runtime-dev-queue.js";
import { reservedSlotDemandForQueue, type RuntimeDevQueueReservationContext } from "./runtime-dev-queue-build-reservation.js";
import type { PlayerRuntimeSummary, ServerDevQueueEntry } from "./player-runtime-summary.js";

export type RuntimeDevQueueCommandContext = RuntimeDevQueueReservationContext & {
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

/** True for a BUILD entry that reserves MP/a slot -- REMOVE_STRUCTURE never does (removal frees a slot, it doesn't consume one). SETTLE reserves MP too, via a separate path below, since it has no slot requirements. */
function isReservableBuildEntry(kind: ServerDevQueueEntry["kind"], structureType: string | undefined): structureType is string {
  return kind === "BUILD" && !!structureType && structureType !== "REMOVE_STRUCTURE";
}

function refundEntryReservation(context: RuntimeDevQueueCommandContext, playerId: string, entry: ServerDevQueueEntry | undefined): void {
  if (entry?.reservedManpower) context.refundManpowerReservation(playerId, entry.reservedManpower);
}

export const handleDevQueueEnqueueCommand = (context: RuntimeDevQueueCommandContext, command: CommandEnvelope): void => {
  const payload = parseDevQueueEnqueuePayload(command.payloadJson);
  if (!payload) { context.rejectCommand(command, "BAD_COMMAND", "invalid command payload"); return; }
  const summary = context.summaryForPlayer(command.playerId);
  if (summary.devQueue.some((e) => e.tileKey === payload.tileKey)) {
    context.rejectCommand(command, "DEV_QUEUE_FULL", "dev queue is full or already contains this tile");
    return;
  }

  let reservedManpower: number | undefined;
  let reservedSlotRequirements: ServerDevQueueEntry["reservedSlotRequirements"];
  if (isReservableBuildEntry(payload.kind, payload.structureType)) {
    const extraSlotDemand = reservedSlotDemandForQueue(summary.devQueue);
    const reservation = context.estimateBuildReservation(command.playerId, payload.structureType, payload.x, payload.y, extraSlotDemand);
    if (!reservation.ok) { context.rejectCommand(command, reservation.code, reservation.message); return; }
    context.applyManpowerReservation(command.playerId, reservation.manpowerCost);
    reservedManpower = reservation.manpowerCost;
    reservedSlotRequirements = reservation.slotRequirements;
  } else if (payload.kind === "SETTLE") {
    const reservation = context.estimateSettleReservation(command.playerId);
    if (!reservation.ok) { context.rejectCommand(command, reservation.code, reservation.message); return; }
    context.applyManpowerReservation(command.playerId, reservation.manpowerCost);
    reservedManpower = reservation.manpowerCost;
  }

  // From here the manpower is already debited but not yet owed by anything in
  // the queue -- so every exit out of this section, including an unexpected
  // throw, has to hand it back. Losing a player's manpower to a transient
  // error is never acceptable; double-refunding is prevented by clearing the
  // local `reservedManpower` the moment the entry takes ownership of it.
  let unownedReservation = reservedManpower;
  try {
    const { queue, accepted } = devQueueEnqueue(
      summary.devQueue,
      { ...payload, ...(reservedManpower ? { reservedManpower } : {}), ...(reservedSlotRequirements ? { reservedSlotRequirements } : {}) },
      context.now()
    );
    if (!accepted) {
      context.rejectCommand(command, "DEV_QUEUE_FULL", "dev queue is full or already contains this tile");
      return;
    }
    summary.devQueue = queue;
    unownedReservation = undefined; // the queued entry now carries the refund obligation
    context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
  } finally {
    if (unownedReservation) context.refundManpowerReservation(command.playerId, unownedReservation);
  }
  // Drained outside the try: by here the reservation is owned by the queue
  // entry, and tryDrainDevQueue does its own refund-before-dispatch.
  tryDrainDevQueue(context, command.playerId);
};

export const handleDevQueueCancelCommand = (context: RuntimeDevQueueCommandContext, command: CommandEnvelope): void => {
  const payload = parseDevQueueTileKeyPayload(command.payloadJson);
  if (!payload) { context.rejectCommand(command, "BAD_COMMAND", "invalid command payload"); return; }
  const summary = context.summaryForPlayer(command.playerId);
  refundEntryReservation(context, command.playerId, devQueueEntryForTileKey(summary.devQueue, payload.tileKey));
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
 *
 * Any reservedManpower this entry holds is refunded first, immediately
 * before dispatch -- the dispatched BUILD_STRUCTURE command then re-derives
 * and re-charges the exact, current cost itself (fort/siege tier, tech,
 * Quartermaster's Office discount, tile eligibility, ...), so the queue-time
 * estimate never needs to be exactly right, only a fair soft hold.
 */
export const tryDrainDevQueue = (context: RuntimeDevQueueCommandContext, playerId: string): void => {
  const summary = context.summaryForPlayer(playerId);
  if (summary.devQueue.length === 0) return;
  if (!context.hasAvailableDevelopmentSlot(playerId)) return;
  const entry = summary.devQueue[0]!;
  summary.devQueue = summary.devQueue.slice(1);
  refundEntryReservation(context, playerId, entry);
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
