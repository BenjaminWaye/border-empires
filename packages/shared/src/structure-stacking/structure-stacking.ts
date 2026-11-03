import type { BuildableStructureType } from "../structure-costs/structure-costs.js";

// Single source of truth for which support-ring structures a town may host
// more than one copy of. The simulation's build handler
// (resolveTownSupportTarget, apps/simulation/src/runtime-structure-town-support-target.ts)
// and the AI's economic build planner (chooseBestEconomicBuild,
// apps/simulation/src/ai/structure-command-planner.ts) both read it, so the AI
// can never again refuse a legal 2nd copy (or propose an illegal one) because
// the two sides kept separate lists.

// Placement mode "same_tile" types that stack with no per-town limit
// (Manufactory: each active copy adds to town coin; Ancillary Depot: each copy
// adds manpower cap; the two Weapons Factories: no per-town limit). When the
// build target is the town tile itself, the runtime redirects them to an open
// support tile with no uniqueness gate.
export const STACKING_SAME_TILE_SUPPORT_STRUCTURE_TYPES: ReadonlySet<BuildableStructureType> = new Set<BuildableStructureType>([
  "MANUFACTORY",
  "ANCILLARY_DEPOT",
  "TITANIUM_WEAPONS_FACTORY",
  "UMBRITE_WEAPONS_FACTORY"
]);

// Placement mode "town_support" types exempt from the "town already has X"
// singleton gate: a town can host as many as it has open support tiles for.
export const STACKING_TOWN_SUPPORT_STRUCTURE_TYPES: ReadonlySet<BuildableStructureType> = new Set<BuildableStructureType>([
  "AETHER_CONDENSER",
  "HIGH_YIELD_AETHER_CONDENSER"
]);

/** True when one town may host more than one copy of `structureType`. */
export const structureStacksPerTown = (structureType: BuildableStructureType): boolean =>
  STACKING_SAME_TILE_SUPPORT_STRUCTURE_TYPES.has(structureType) || STACKING_TOWN_SUPPORT_STRUCTURE_TYPES.has(structureType);
