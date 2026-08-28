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
