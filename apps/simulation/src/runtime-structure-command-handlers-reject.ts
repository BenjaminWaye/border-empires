import type { CommandEnvelope } from "@border-empires/sim-protocol";
import { structureDisplayName } from "@border-empires/shared";
import type { RuntimeStructureCommandContext } from "./runtime-structure-command-handlers.js";

export function rejectCommand(
  context: Pick<RuntimeStructureCommandContext, "emitEvent">,
  command: CommandEnvelope,
  code: string,
  message: string
): void {
  context.emitEvent({
    eventType: "COMMAND_REJECTED",
    commandId: command.commandId,
    playerId: command.playerId,
    code,
    message
  });
}

// Player-facing name for rejection toasts ("unlock trade nexus first"), from
// the same shared table the client renders, so a rename can't leave a stale
// internal name in a BUILD_INVALID message. Lowercased to fit mid-sentence.
export function structureLabel(type: string): string {
  return structureDisplayName(type).toLowerCase();
}

export function activeOrInactive(structure: { status: string } | undefined): boolean {
  return structure?.status === "active" || structure?.status === "inactive";
}
