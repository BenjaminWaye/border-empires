// Split out of client-action-flow.ts (already over the repo's 500-line
// file-growth cap) so this file can grow independently.
import { economicStructureName } from "../client-map-display.js";
import type { BuildableStructureType } from "@border-empires/shared";

// Human-readable label for a buildable structure type. Reuses the shared
// economic-structure name table, with explicit branches for the defensive /
// observatory / display names that table doesn't cover (or labels differently).
export const structureDisplayLabel = (
  structureType: BuildableStructureType,
  state: { techIds: string[] }
): string => {
  if (structureType === "FORT") {
    return state.techIds.includes("steelworking")
      ? "Thunder Bastion"
      : state.techIds.includes("fortified-walls")
        ? "Titanium Bastion"
        : "Fort";
  }
  if (structureType === "SIEGE_OUTPOST") {
    return state.techIds.includes("standing-army")
      ? "Dread Tower"
      : state.techIds.includes("siegecraft")
        ? "Siege Tower"
        : "Siege Outpost";
  }
  if (structureType === "OBSERVATORY") return "Observatory";
  if (structureType === "AIRPORT") return "Airport";
  if (structureType === "RADAR_SYSTEM") return "Radar System";
  return economicStructureName(structureType);
};
