// Server-durable "claim continuation" command handler + drain -- see
// player-runtime-summary.ts's ClaimContinuation doc comment for the shape.
// Follows the same context-object pattern as runtime-dev-queue-command-
// handlers.ts and delegates to the same devQueue tail (devQueueEnqueue +
// tryDrainDevQueue) so SETTLE/BUILD keep draining while the player is
// offline, whether the tile is already owned+FRONTIER right now or an
// in-flight EXPAND is what lands it (see the caller in
// runtime-lock-resolution.ts's resolveLock).
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import { DEV_QUEUE_SERVER_CAP } from "@border-empires/shared";
import { devQueueEnqueue } from "./runtime-dev-queue.js";
import { tryDrainDevQueue, type RuntimeDevQueueCommandContext } from "./runtime-dev-queue-command-handlers.js";
import type { ClaimContinuation, PlayerRuntimeSummary } from "./player-runtime-summary.js";

export type RuntimeClaimContinuationCommandContext = RuntimeDevQueueCommandContext & {
  /** True if the tile is right now owned + FRONTIER by this player (no EXPAND in flight). */
  isOwnedFrontierTile: (playerId: string, x: number, y: number) => boolean;
};

/** Builds the full context from a devQueue context + the tiles map -- keeps runtime.ts's own wiring to one line (that file is already oversized). */
export const claimContinuationContextFromDevQueueContext = (
  devQueueContext: RuntimeDevQueueCommandContext,
  tiles: Map<string, { ownerId?: string | undefined; ownershipState?: string | undefined }>
): RuntimeClaimContinuationCommandContext => ({
  ...devQueueContext,
  isOwnedFrontierTile: (playerId, x, y) => {
    const tile = tiles.get(`${x},${y}`);
    return tile !== undefined && tile.ownerId === playerId && tile.ownershipState === "FRONTIER";
  }
});

export type ClaimContinuationSetPayload = { x: number; y: number; tileKey: string; structureType?: string };

export const parseClaimContinuationSetPayload = (payloadJson: string): ClaimContinuationSetPayload | null => {
  try {
    const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number") return null;
    if (typeof parsed.structureType !== "undefined" && typeof parsed.structureType !== "string") return null;
    return {
      x: parsed.x,
      y: parsed.y,
      tileKey: `${parsed.x},${parsed.y}`,
      ...(typeof parsed.structureType === "string" ? { structureType: parsed.structureType } : {})
    };
  } catch {
    return null;
  }
};

// devQueue holds at most one entry per tileKey (see devQueueEnqueue's dedup),
// mirroring the client's own tiered dev-queue (SETTLE must fully drain
// before BUILD can be enqueued for the same tile). So a continuation with a
// structureType can't push both steps up front -- it enqueues SETTLE now and
// stays registered in claimContinuations until tryDrainClaimContinuationBuildTail
// (called once the settlement actually completes) enqueues the BUILD tail.

const enqueueSettleStep = (summary: PlayerRuntimeSummary, x: number, y: number, tileKey: string, nowMs: number): boolean => {
  if (summary.devQueue.some((entry) => entry.tileKey === tileKey && entry.kind === "SETTLE")) return true;
  const { queue, accepted } = devQueueEnqueue(summary.devQueue, { x, y, tileKey, kind: "SETTLE" }, nowMs);
  summary.devQueue = queue;
  return accepted;
};

/**
 * Fallback for a captured/claimed town or dock that couldn't auto-settle
 * immediately only because no development slot was free at the moment of
 * capture (see runtime-lock-resolution.ts's resolveLock, the only caller).
 * Queues a SETTLE dev-queue entry for the tile via the same devQueue tail as
 * a claim continuation's settle step, so it drains -- and the town actually
 * settles -- the instant a slot frees, instead of the tile sitting on an
 * out-of-reach decay timer with no guaranteed chance to be settled before it
 * expires. Returns whether the entry was actually queued (false only if the
 * player's dev queue is already full), so the caller can fall back to decay.
 */
export const queueCapturedAnchorSettle = (
  context: RuntimeDevQueueCommandContext,
  playerId: string,
  targetKey: string,
  x: number,
  y: number
): boolean => {
  const summary = context.summaryForPlayer(playerId);
  const accepted = enqueueSettleStep(summary, x, y, targetKey, context.now());
  if (accepted) tryDrainDevQueue(context, playerId);
  return accepted;
};

export const handleClaimContinuationSetCommand = (
  context: RuntimeClaimContinuationCommandContext,
  command: CommandEnvelope
): void => {
  const payload = parseClaimContinuationSetPayload(command.payloadJson);
  if (!payload) { context.rejectCommand(command, "BAD_COMMAND", "invalid command payload"); return; }
  const summary = context.summaryForPlayer(command.playerId);
  const continuation: ClaimContinuation = payload.structureType ? { structureType: payload.structureType } : {};
  if (!summary.claimContinuations.has(payload.tileKey) && summary.claimContinuations.size >= DEV_QUEUE_SERVER_CAP) {
    context.rejectCommand(command, "CLAIM_CONTINUATION_FULL", "too many pending claim continuations");
    return;
  }
  if (context.isOwnedFrontierTile(command.playerId, payload.x, payload.y)) {
    // No EXPAND in flight -- the tile is already ours and FRONTIER, so drive
    // the SETTLE step immediately instead of waiting on a lock resolution
    // that will never come for this tile. If a build should follow, keep the
    // continuation registered -- tryDrainClaimContinuationBuildTail picks it
    // up once the settlement actually completes.
    const settleEnqueued = enqueueSettleStep(summary, payload.x, payload.y, payload.tileKey, context.now());
    if (payload.structureType || !settleEnqueued) summary.claimContinuations.set(payload.tileKey, continuation);
    else summary.claimContinuations.delete(payload.tileKey);
    context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
    tryDrainDevQueue(context, command.playerId);
    return;
  }
  summary.claimContinuations.set(payload.tileKey, continuation);
  context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
};

/**
 * Called from resolveLock's winning-EXPAND branch, once the target tile's
 * ownership has actually transitioned to the claiming player. Looks up any
 * registered continuation for that tile and, if present, enqueues the SETTLE
 * step via the same devQueue path -- so it completes even if the player who
 * clicked "Build Relay Beacon" (or any settle+build combo) disconnected the
 * instant after the EXPAND was sent. Leaves the continuation registered when
 * a build should follow -- see tryDrainClaimContinuationBuildTail.
 */
export const tryDrainClaimContinuation = (
  context: RuntimeDevQueueCommandContext,
  playerId: string,
  tileKey: string,
  x: number,
  y: number
): void => {
  const summary = context.summaryForPlayer(playerId);
  const continuation = summary.claimContinuations.get(tileKey);
  if (!continuation) return;
  const settleEnqueued = enqueueSettleStep(summary, x, y, tileKey, context.now());
  if (!continuation.structureType && settleEnqueued) summary.claimContinuations.delete(tileKey);
  tryDrainDevQueue(context, playerId);
};

/**
 * Called once a settlement actually completes (see resolvePendingSettlement
 * in runtime.ts, and RUSH_BUY's early-completion path that reuses it). If a
 * claim continuation with a structureType is still registered for this tile,
 * consumes it and enqueues the BUILD tail -- the devQueue slot it needs is
 * now free since the SETTLE step it was waiting behind is gone.
 */
export const tryDrainClaimContinuationBuildTail = (
  context: RuntimeDevQueueCommandContext,
  playerId: string,
  tileKey: string,
  x: number,
  y: number
): void => {
  const summary = context.summaryForPlayer(playerId);
  const continuation = summary.claimContinuations.get(tileKey);
  if (!continuation?.structureType) return;
  if (summary.devQueue.some((entry) => entry.tileKey === tileKey && entry.kind === "BUILD")) {
    summary.claimContinuations.delete(tileKey);
    return;
  }
  const { queue, accepted } = devQueueEnqueue(summary.devQueue, { x, y, tileKey, kind: "BUILD", structureType: continuation.structureType }, context.now());
  summary.devQueue = queue;
  if (accepted) summary.claimContinuations.delete(tileKey);
  tryDrainDevQueue(context, playerId);
};
