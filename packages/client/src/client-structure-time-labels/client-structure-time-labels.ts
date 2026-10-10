// Build and removal durations for the structure-info card (tech tree, tile
// menu, HUD). Fort and Siege tiers (Titanium Bastion, Siege Tower, ...) each
// build for their own tier's manpower, so they can't be collapsed onto the
// base Fort/Siege Battery the way structureBaseKey does for costs.
import {
  FORT_TIER_LADDER,
  SIEGE_TIER_LADDER,
  fortBuildDurationMs,
  fortRemovalDurationMs,
  siegeOutpostBuildDurationMs,
  siegeOutpostRemovalDurationMs,
  structureBuildDurationMs,
  structureRemovalDurationMs,
  type FortVariant,
  type SiegeOutpostVariant
} from "@border-empires/shared";
import type { StructureInfoKey } from "../client-map-display.js";
import { structureBaseKey } from "../client-structure-cost-bits.js";

const isFortVariant = (key: string): key is FortVariant => Object.hasOwn(FORT_TIER_LADDER, key);
const isSiegeVariant = (key: string): key is SiegeOutpostVariant => Object.hasOwn(SIEGE_TIER_LADDER, key);

export const structureInfoBuildMs = (key: StructureInfoKey, ownedCount: number): number => {
  if (isFortVariant(key)) return fortBuildDurationMs(key);
  if (isSiegeVariant(key)) return siegeOutpostBuildDurationMs(key);
  return structureBuildDurationMs(structureBaseKey(key), ownedCount);
};

export const structureInfoRemovalMs = (key: StructureInfoKey): number => {
  if (isFortVariant(key)) return fortRemovalDurationMs(key);
  if (isSiegeVariant(key)) return siegeOutpostRemovalDurationMs(key);
  return structureRemovalDurationMs(structureBaseKey(key));
};
