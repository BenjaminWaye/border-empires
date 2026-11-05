import { STRUCTURE_REGISTRY } from "@border-empires/shared";
import { DISTRICT_BUILDING_KINDS } from "../../../../client/src/client-town-district/district-catalog.js";

// Buildability comes from the live registry, not the save-compatible type union.
export const CURRENT_DISTRICT_KINDS = DISTRICT_BUILDING_KINDS.filter(kind => Boolean(STRUCTURE_REGISTRY[kind]));
export const RETIRED_DISTRICT_KINDS = DISTRICT_BUILDING_KINDS.filter(kind => !STRUCTURE_REGISTRY[kind]);
