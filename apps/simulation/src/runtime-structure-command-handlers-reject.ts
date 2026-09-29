import type { CommandEnvelope } from "@border-empires/sim-protocol";
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

// Aether Condenser is the client-visible rename of CRYSTAL_SYNTHESIZER (see
// STRUCTURE_DISPLAY_NAMES in client-structure-display-names.ts); server
// rejection messages otherwise derive their label straight from the type
// constant, so without this override players saw the stale internal name
// ("crystal synthesizer") in the BUILD_INVALID toast.
const STRUCTURE_LABEL_OVERRIDES: Partial<Record<string, string>> = {
  CRYSTAL_SYNTHESIZER: "aether condenser",
  ADVANCED_CRYSTAL_SYNTHESIZER: "advanced aether condenser",
  FOUNDRY: "ore refinery",
  // Manifest tree naming/lore pass (docs/manifest-tree-mapping-plan.md):
  // GARRISON_HALL/ASSEMBLY_WORKS and LOGISTICS_GUILD/RAIL_DEPOT swapped
  // display names (see STRUCTURE_DISPLAY_NAMES in
  // client-structure-display-names.ts) -- without these overrides players
  // would see the stale internal name in the BUILD_INVALID toast.
  GARRISON_HALL: "ancillary depot",
  ASSEMBLY_WORKS: "reserve lattice",
  LOGISTICS_GUILD: "ancillary factory",
  RAIL_DEPOT: "neural works"
};

export function structureLabel(type: string): string {
  return STRUCTURE_LABEL_OVERRIDES[type] ?? type.toLowerCase().replaceAll("_", " ");
}

export function activeOrInactive(structure: { status: string } | undefined): boolean {
  return structure?.status === "active" || structure?.status === "inactive";
}
