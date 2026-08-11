import type { StructureSpec } from "./structure-registry/structure-registry.js";
import { FORT_SPECS } from "./structure-registry-fort.js";
import { OBSERVATORY_SPEC } from "./structure-registry-observatory.js";
import { RELAY_BEACON_SPEC, OUTPOST_SPECS } from "./structure-registry-outpost.js";
import { ECONOMIC_SPECS } from "./structure-registry-economic.js";

/**
 * Combined structure registry covering every buildable structure type.
 *
 * Sources:
 * - 3 fort variants (FORT, TITANIUM_BASTION, THUNDER_BASTION)
 * - 1 observatory (OBSERVATORY)
 * - 4 outpost variants (SIEGE_OUTPOST, SIEGE_TOWER, DREAD_TOWER, RELAY_BEACON)
 * - 34 economic structures (all EconomicStructureType values except WOODEN_FORT
 *   and RELAY_BEACON)
 *
 * Phase 1: data extraction only — this registry is NOT yet consumed by any
 * handler. Phase 2 will wire it into a unified BUILD_STRUCTURE handler.
 *
 * Coverage: 3 forts + 1 observatory + 4 outposts + 35 economic (including
 * WOODEN_FORT) = 43 total.
 */
export const STRUCTURE_REGISTRY: Record<string, StructureSpec> = {
  ...FORT_SPECS,
  OBSERVATORY: OBSERVATORY_SPEC,
  ...OUTPOST_SPECS,
  RELAY_BEACON: RELAY_BEACON_SPEC,
  ...ECONOMIC_SPECS,
};

/** Total number of structure types in the registry. Expected: 42. */
export const STRUCTURE_REGISTRY_SIZE = Object.keys(STRUCTURE_REGISTRY).length;
