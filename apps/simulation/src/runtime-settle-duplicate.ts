// CLAIM_CONTINUATION_SET's immediate-drive branch
// (runtime-claim-continuation-command-handlers.ts) can enqueue and dispatch
// its own SETTLE for an owned FRONTIER tile in the same tick the client's
// direct SETTLE (from "Build Relay Beacon" on that tile) also arrives. Both
// requests want the same already-in-flight outcome, so a same-player
// duplicate resolves as a no-op instead of rejecting with SETTLE_INVALID
// "tile is already settling" -- see runtime.ts's handleSettleCommand. A
// different player's settlement on the tile is a real conflict and still
// rejects.
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import type { PendingSettlementRecord } from "./player-runtime-summary.js";

export type DuplicateSettlementContext = {
  emitEvent: (event: { eventType: "COMMAND_RESOLVED"; commandId: string; playerId: string }) => void;
  rejectCommand: (command: Pick<CommandEnvelope, "commandId" | "playerId">, code: string, message: string) => void;
};

/** Returns true if the SETTLE was fully handled (resolved or rejected) and the caller should stop. */
export const handleDuplicatePendingSettlement = (
  context: DuplicateSettlementContext,
  existing: PendingSettlementRecord | undefined,
  command: Pick<CommandEnvelope, "commandId" | "playerId">
): boolean => {
  if (!existing) return false;
  if (existing.ownerId === command.playerId) {
    context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
    return true;
  }
  context.rejectCommand(command, "SETTLE_INVALID", "tile is already settling");
  return true;
};

/**
 * A SETTLE whose target is not one of the actor's frontier tiles. If the actor
 * already garrisoned it, the SETTLE is already done: their own auto-garrison
 * (ticked a moment before, and instant for a new player's first garrisons)
 * settled it before the manual tap arrived. Resolving it, instead of rejecting
 * with "tile is not one of your frontier tiles", is what the player asked for
 * (first-15 playtest r1: pt-diplomat, pt-warlord, pt-predator). The state
 * update hands the client back the coin/manpower it predicted spending. Any
 * other tile still rejects.
 */
export const handleSettleOnNonFrontierTile = (
  context: DuplicateSettlementContext & { emitPlayerStateUpdate: (command: Pick<CommandEnvelope, "commandId" | "playerId">) => void },
  target: { ownerId?: string | undefined; ownershipState?: string | undefined },
  command: Pick<CommandEnvelope, "commandId" | "playerId">
): void => {
  if (target.ownerId !== command.playerId || target.ownershipState !== "SETTLED") {
    context.rejectCommand(command, "SETTLE_INVALID", "tile is not one of your frontier tiles");
    return;
  }
  context.emitPlayerStateUpdate(command);
  context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
};
