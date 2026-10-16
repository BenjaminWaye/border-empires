import type { SimulationEvent } from "@border-empires/sim-protocol";

// Instant abilities resolve without combat or a build delta. They must
// release the same pending-command gate as other AI actions.
export function isAiCommandOutcome(type: SimulationEvent["eventType"]): boolean {
  return type === "COMMAND_REJECTED" || type === "COMMAND_RESOLVED" ||
    type === "COMBAT_RESOLVED" || type === "TILE_DELTA_BATCH" ||
    type === "TECH_UPDATE" || type === "DOMAIN_UPDATE";
}
