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
//   1. Military     -- curated set below (combat role isn't in metadata)
//   2. Resource     -- resourceTypes present (needs a specific resource tile)
//   3. Town Support -- structureRequiresTownOrSupportTile (only buildable on
//                      a town / its support ring, never generic settled land)
//   4. Infrastructure -- everything else, i.e. buildable on any owned
//                      settled tile (vision, admin, utility)
// Deliberately NOT based on placementMode: that field only says whether a
// structure caps at one-per-town or can stack, not where it can be built
// (Mintworks is "same_tile" purely so it can stack, yet is still
// support-ring-only) -- see the NOTE in structure-placement.ts.
export type BuildingCategory = "military" | "resource" | "town_support" | "infrastructure";

export const BUILDING_CATEGORY_ORDER: BuildingCategory[] = ["military", "resource", "town_support", "infrastructure"];

export const BUILDING_CATEGORY_LABELS: Record<BuildingCategory, string> = {
  military: "Military",
  resource: "Resource",
  town_support: "Town Support",
  infrastructure: "Infra\u00ADstructure"
};

export const BUILDING_CATEGORY_ICONS: Record<BuildingCategory, string> = {
  military: "⚔",
  resource: "⛏",
  town_support: "⚑",
  infrastructure: "⚙"
};

// Fort/siege families, Airport (bombardment), the
// defensive detection structures (Observatory blocks hostile crystal
// actions, Radar System blocks sky bombardment), and the offensive/defensive
// wonder chains (each *_PART_n plus its completed form). Garrison Hall (a
// manpower hub), Aether Tower (a power node) and the Weapons Factories
// (support-ring empire-wide bonuses) are deliberately NOT here -- they fall
// through to Town Support / Infrastructure. Everything else that isn't
// resource-tile-gated or town-support-only falls through to Infrastructure.
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
  "RADAR_SYSTEM",
  "AEGIS_DOME",
  "AEGIS_DOME_PART_1",
  "AEGIS_DOME_PART_2",
  "AEGIS_DOME_PART_3",
  "ASTRAL_DOCK",
  "ASTRAL_DOCK_PART_1",
  "ASTRAL_DOCK_PART_2",
  "ASTRAL_DOCK_PART_3",
  "WORLD_ENGINE",
  "WORLD_ENGINE_PART_1",
  "WORLD_ENGINE_PART_2",
  "WORLD_ENGINE_PART_3"
]);

export const structureBuildingCategory = (type: StructurePlacementType): BuildingCategory => {
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
  infrastructure: "No infrastructure structures available on this tile."
};
