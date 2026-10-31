import { isNetworkResource, networkResourceForBuilding, type LandBiome, type ResourceType } from "@border-empires/shared";
import type { Tile } from "../client-types.js";
import { resourceFor3DPopulation } from "../client-map-3d-population/client-map-3d-population.js";

/** The real tile takes precedence; unstreamed photo-mode tiles retain existing synthetic resources. */
export function resolvedMapResource3D(x: number, y: number, terrain: Tile["terrain"], tile: Tile | undefined,
  reveal: boolean, biome: LandBiome | undefined, forest: boolean): ResourceType | undefined {
  const value = resourceFor3DPopulation(x, y, terrain, tile, reveal, biome, forest);
  if (isNetworkResource(value)) return value;
  return value === "FARM" || value === "FISH" || value === "TITANIUM" || value === "UMBRITE" || value === "GEMS" ? value : undefined;
}
// Non-network extraction improvements whose 3D model stands in for the raw
// deposit: a MINE on TITANIUM/GEMS (its cart carries the ore/crystals) and an
// UMBRITE_RIG on UMBRITE. Drawing the deposit too would leave the raw rocks
// poking through the building.
const DEPOSIT_IMPROVEMENT_RESOURCES: Partial<Record<NonNullable<Tile["economicStructure"]>["type"], readonly ResourceType[]>> = {
  MINE: ["TITANIUM", "GEMS"],
  UMBRITE_RIG: ["UMBRITE"]
};

/** Developed models include their raw site; avoid coincident duplicate meshes. */
export const shouldRenderRawResource = (resource: ResourceType, tile: Tile | undefined): boolean => {
  const structureType = tile?.economicStructure?.type;
  if (!structureType) return true;
  if (networkResourceForBuilding(structureType) === resource) return false;
  return !DEPOSIT_IMPROVEMENT_RESOURCES[structureType]?.includes(resource);
};
