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
/** Developed models include their raw site; avoid coincident duplicate meshes. */
export const shouldRenderRawResource = (resource: ResourceType, tile: Tile | undefined): boolean =>
  !tile?.economicStructure || networkResourceForBuilding(tile.economicStructure.type) !== resource;
