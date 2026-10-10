// Build and removal durations for the structure-info card (tech tree, tile
// menu, HUD). Fort and Siege tiers (Titanium Bastion, Siege Tower, ...) each
// build for their own tier's manpower, so they can't be collapsed onto the
// base Fort/Siege Battery the way structureBaseKey does for costs.
import {
  FORT_TIER_LADDER,
  FORT_VARIANT_LABELS,
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
import { economicStructureName } from "../client-structure-display-names.js";
import type { Tile } from "../client-types.js";
import { buildMsWithSpeedForState, type BuildSpeedState } from "../client-build-speed/client-build-speed.js";

export type { BuildSpeedState };

const isFortVariant = (key: string): key is FortVariant => Object.hasOwn(FORT_TIER_LADDER, key);
const isSiegeVariant = (key: string): key is SiegeOutpostVariant => Object.hasOwn(SIEGE_TIER_LADDER, key);

const baseBuildMs = (key: StructureInfoKey, ownedCount: number): number => {
  if (isFortVariant(key)) return fortBuildDurationMs(key);
  if (isSiegeVariant(key)) return siegeOutpostBuildDurationMs(key);
  return structureBuildDurationMs(structureBaseKey(key), ownedCount);
};

/** Build time for the info card; with the viewer's state it includes their build-speed effects. */
export const structureInfoBuildMs = (key: StructureInfoKey, ownedCount: number, speedState?: BuildSpeedState): number => {
  const baseMs = baseBuildMs(key, ownedCount);
  return speedState ? buildMsWithSpeedForState(speedState, key, baseMs) : baseMs;
};

export const structureInfoRemovalMs = (key: StructureInfoKey): number => {
  if (isFortVariant(key)) return fortRemovalDurationMs(key);
  if (isSiegeVariant(key)) return siegeOutpostRemovalDurationMs(key);
  return structureRemovalDurationMs(structureBaseKey(key));
};

/** The Remove action's label and duration for whatever structure stands on the tile. */
export const structureLabelForRemoval = (tile: Tile): { label: string; durationMs: number } | undefined => {
  if (tile.fort) return { label: FORT_VARIANT_LABELS[tile.fort.variant ?? "FORT"], durationMs: fortRemovalDurationMs(tile.fort.variant) };
  if (tile.observatory) return { label: "Aether Tower", durationMs: structureRemovalDurationMs("OBSERVATORY") };
  if (tile.siegeOutpost) return { label: "Siege Battery", durationMs: siegeOutpostRemovalDurationMs(tile.siegeOutpost.variant) };
  if (tile.economicStructure) return { label: economicStructureName(tile.economicStructure.type), durationMs: structureRemovalDurationMs(tile.economicStructure.type) };
  return undefined;
};
