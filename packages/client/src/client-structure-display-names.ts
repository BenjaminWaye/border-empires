// Structure display names live in @border-empires/shared
// (structure-display-names.ts) so the simulation's rejection toasts and
// economy labels use the same names as the client. Re-exported here for the
// many client modules that already import from this path.
import { STRUCTURE_DISPLAY_NAMES, structureDisplayName } from "@border-empires/shared";
import type { EconomicStructureType, StructureInfoKey } from "./client-map-display.js";

export { STRUCTURE_DISPLAY_NAMES };

export const economicStructureName = (type: EconomicStructureType | StructureInfoKey): string => structureDisplayName(type);
