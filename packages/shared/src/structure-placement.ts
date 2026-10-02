import type { BuildableStructureType } from "./structure-costs/structure-costs.js";
import structurePlacementMetadataJson from "./structure-placement-metadata.json" with { type: "json" };
import type { FortVariant, OwnershipState, PopulationTier, ResourceType, SiegeOutpostVariant } from "./types.js";

export type StructurePlacementType = BuildableStructureType | FortVariant | SiegeOutpostVariant;
export type StructureTileSurface = "settled" | "frontier" | "resource" | "town" | "support" | "dock" | "dock_support";
export type StructurePlacementMode = "same_tile" | "town_support" | "dock_support";
export type StructureSortGroup = "support" | "general" | "resource" | "military";
export type StructureBorderRule = "border" | "border_or_dock";

export type StructurePlacementMetadata = {
  showOn: readonly StructureTileSurface[];
  placementMode: StructurePlacementMode;
  sortGroup: StructureSortGroup;
  requiresBorder?: StructureBorderRule;
  resourceTypes?: readonly ResourceType[];
};

type TileSurfaceInput = {
  ownershipState?: OwnershipState | undefined;
  resource?: ResourceType | undefined;
  dockId?: string | undefined;
  townPopulationTier?: PopulationTier | undefined;
  supportedTownCount?: number | undefined;
  supportedDockCount?: number | undefined;
};

const STRUCTURE_PLACEMENT_METADATA = structurePlacementMetadataJson as Record<StructurePlacementType, StructurePlacementMetadata>;

export const structurePlacementMetadata = (type: StructurePlacementType): StructurePlacementMetadata => STRUCTURE_PLACEMENT_METADATA[type];

// NOTE: placementMode is NOT "where this structure is allowed to be built" --
// it's "does this structure cap at one per town (town_support) or can it
// stack (same_tile)". MINTWORKS, GARRISON_HALL, TITANIUM_WEAPONS_FACTORY and
// UMBRITE_WEAPONS_FACTORY are placementMode "same_tile" specifically so they
// can stack multiple copies per town (see
// apps/simulation/src/runtime-structure-town-support-target.ts,
// STACKING_SUPPORT_STRUCTURE_TILE_REDIRECT_TYPES) -- but they still only
// show on town/support tiles, exactly like the capped town_support
// structures. Don't use isTownSupportPlacementStructure (or placementMode
// generally) to answer "is this tile-location-restricted to a town's
// support ring" -- it answers the stacking-cap question instead. Use
// structureRequiresTownOrSupportTile below for the location question.
export const isTownSupportPlacementStructure = (type: StructurePlacementType): boolean =>
  structurePlacementMetadata(type).placementMode === "town_support";

export const isDockSupportPlacementStructure = (type: StructurePlacementType): boolean =>
  structurePlacementMetadata(type).placementMode === "dock_support";

// Whether this structure can ONLY be built on a town tile or its support
// ring (never on generic owned settled land) -- derived from showOn, not
// placementMode (see the NOTE above). True for both the one-per-town
// town_support structures (Caravanary, Granary, synthesizers, ...) and the
// stacking same_tile ones that are still support-ring-only (Mintworks,
// Garrison Hall, both Weapons Factories). False for structures like
// Observatory/Relay Beacon/Waterworks/Airport whose showOn also includes
// "settled", meaning they're buildable on any owned settled tile.
export const structureRequiresTownOrSupportTile = (type: StructurePlacementType): boolean => {
  const { showOn } = structurePlacementMetadata(type);
  return (showOn.includes("town") || showOn.includes("support")) && !showOn.includes("settled");
};

export const structureTileSurfaces = (input: TileSurfaceInput): StructureTileSurface[] => {
  const surfaces = new Set<StructureTileSurface>();
  if (input.ownershipState === "SETTLED") surfaces.add("settled");
  if (input.ownershipState === "FRONTIER") surfaces.add("frontier");
  if (input.resource) surfaces.add("resource");
  if (input.dockId) surfaces.add("dock");
  if (input.townPopulationTier) surfaces.add("town");
  if ((input.supportedTownCount ?? 0) > 0) surfaces.add("support");
  if ((input.supportedDockCount ?? 0) > 0) surfaces.add("dock_support");
  return [...surfaces];
};

export const structureShowsOnTile = (type: StructurePlacementType, input: TileSurfaceInput): boolean => {
  const metadata = structurePlacementMetadata(type);
  const surfaces = structureTileSurfaces(input);
  if (metadata.resourceTypes && !input.resource) return false;
  if (metadata.resourceTypes && input.resource && !metadata.resourceTypes.includes(input.resource)) return false;
  return metadata.showOn.some((surface) => surfaces.includes(surface));
};

export const structureSortRank = (type: StructurePlacementType): number => {
  const group = structurePlacementMetadata(type).sortGroup;
  if (group === "support") return 0;
  if (group === "general") return 1;
  if (group === "resource") return 2;
  return 3;
};
