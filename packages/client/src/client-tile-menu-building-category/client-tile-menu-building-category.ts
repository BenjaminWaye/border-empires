import {
  structurePlacementMetadata,
  structureRequiresTownOrSupportTile,
  type StructurePlacementType
} from "@border-empires/shared";
import { structureTypeForTileAction } from "../client-tile-action-support/client-tile-action-support.js";
import type { TileActionDef } from "../client-types.js";

// UI-facing building category, distinct from the shared sortGroup field.
// sortGroup (structure-placement.ts) only encodes build-priority sort
// order, not player-facing theme -- its "support" tier mixes weapons
// factories in with granaries, and its "military" tier includes
// vision/utility structures like Relay Beacon and Observatory. This module
// classifies by actual function instead, in this order (first match wins):
//   1. Monument     -- the 6 monuments + their components (curated set)
//   2. Military     -- curated set below (combat role isn't in metadata)
//   3. Resource     -- resourceTypes present (needs a specific resource tile)
//   4. Town Support -- structureRequiresTownOrSupportTile (only buildable on
//                      a town / its support ring, never generic settled land)
//   5. Infrastructure -- everything else, i.e. buildable on any owned
//                      settled tile (vision, admin, utility)
// Deliberately NOT based on placementMode: that field only says whether a
// structure caps at one-per-town or can stack, not where it can be built
// (Mintworks is "same_tile" purely so it can stack, yet is still
// support-ring-only) -- see the NOTE in structure-placement.ts.
export type BuildingCategory = "military" | "resource" | "town_support" | "infrastructure" | "monument";

export const BUILDING_CATEGORY_ORDER: BuildingCategory[] = ["military", "resource", "town_support", "infrastructure", "monument"];

export const BUILDING_CATEGORY_LABELS: Record<BuildingCategory, string> = {
  military: "Military",
  resource: "Resource",
  town_support: "Town Support",
  infrastructure: "Infra\u00ADstructure",
  monument: "Monuments"
};

export const BUILDING_CATEGORY_ICONS: Record<BuildingCategory, string> = {
  military: "⚔",
  resource: "⛏",
  town_support: "⚑",
  infrastructure: "⚙",
  monument: "♛"
};

// Fort/siege families, Airport (bombardment), and the defensive detection
// structures (Observatory blocks hostile crystal actions, Radar System blocks
// sky bombardment). Garrison Hall (a manpower hub), Aether Tower (a power
// node) and the Weapons Factories (support-ring empire-wide bonuses) are
// deliberately NOT here -- they fall through to Town Support / Infrastructure.
const MILITARY_STRUCTURE_TYPES = new Set<StructurePlacementType>([
  "FORT",
  "WOODEN_FORT",
  "TITANIUM_BASTION",
  "THUNDER_BASTION",
  "SIEGE_OUTPOST",
  "SIEGE_TOWER",
  "DREAD_TOWER",
  "AIRPORT",
  "OBSERVATORY",
  "RADAR_SYSTEM"
]);

// The 6 monuments and their 3 components each (see MONUMENT_COMPONENT_TYPES
// in client-tile-action-monument-parts.ts) -- late-game, Great City /
// Monumental City builds, so they get their own category rather than being
// split across Military / Town Support / Infrastructure by effect.
const MONUMENT_STRUCTURE_TYPES = new Set<StructurePlacementType>(
  (["IMPERIAL_EXCHANGE", "WORLD_ENGINE", "AEGIS_DOME", "ASTRAL_DOCK", "POPULATION_BUREAU", "TITANIUM_LEVY"] as const).flatMap((monument) => [
    monument,
    `${monument}_PART_1` as const,
    `${monument}_PART_2` as const,
    `${monument}_PART_3` as const
  ])
);

export const structureBuildingCategory = (type: StructurePlacementType): BuildingCategory => {
  if (MONUMENT_STRUCTURE_TYPES.has(type)) return "monument";
  if (MILITARY_STRUCTURE_TYPES.has(type)) return "military";
  const metadata = structurePlacementMetadata(type);
  if (metadata.resourceTypes && metadata.resourceTypes.length > 0) return "resource";
  if (structureRequiresTownOrSupportTile(type)) return "town_support";
  return "infrastructure";
};

export const buildingActionCategory = (action: TileActionDef): BuildingCategory => {
  const structureType = structureTypeForTileAction(action.id);
  return structureType ? structureBuildingCategory(structureType) : "infrastructure";
};

// Shown on a category square when it has zero buildings on this tile --
// grounded in the actual gate that empties it (resourceTypes / placementMode)
// rather than a generic "nothing here".
export const BUILDING_CATEGORY_EMPTY_REASON: Record<BuildingCategory, string> = {
  military: "No military structures available on this tile.",
  resource: "Requires a farm, fish, titanium, gem, or umbrite resource tile.",
  town_support: "Requires an available town-support tile in this town's ring.",
  infrastructure: "No infrastructure structures available on this tile.",
  monument: "Requires a Great City or Monumental City and the monument's tech."
};
