import type { BuildableStructureType } from "./structure-costs/structure-costs.js";
import structurePlacementMetadataJson from "./structure-placement-metadata.json" with { type: "json" };
import type { FortVariant, OwnershipState, PopulationTier, ResourceType, SiegeOutpostVariant } from "./types.js";

export type StructurePlacementType = BuildableStructureType | FortVariant | SiegeOutpostVariant;
export type StructureTileSurface = "settled" | "resource" | "town" | "support" | "dock" | "dock_support";
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

export const isTownSupportPlacementStructure = (type: StructurePlacementType): boolean =>
  structurePlacementMetadata(type).placementMode === "town_support";

export const isDockSupportPlacementStructure = (type: StructurePlacementType): boolean =>
  structurePlacementMetadata(type).placementMode === "dock_support";

export const structureTileSurfaces = (input: TileSurfaceInput): StructureTileSurface[] => {
  const surfaces = new Set<StructureTileSurface>();
  if (input.ownershipState === "SETTLED") surfaces.add("settled");
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
