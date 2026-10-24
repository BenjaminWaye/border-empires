import { landBiomeAt, terrainAt } from "@border-empires/shared";
import { isForestTile } from "../client-constants.js";
import { resourceFor3DPopulation } from "../client-map-3d-population/client-map-3d-population.js";
import type { Tile } from "../client-types.js";

/** Admin-only synthetic resource display on otherwise unknown 3D tiles. */
export function syntheticRelicPreviewTile(x: number, y: number, tile: Tile | undefined, enabled: boolean): Tile | undefined {
  if (tile || !enabled) return undefined;
  const terrain = terrainAt(x, y);
  if (terrain !== "LAND") return undefined;
  const resource = resourceFor3DPopulation(x, y, terrain, undefined, true, landBiomeAt(x, y), isForestTile(x, y));
  return resource ? { x, y, terrain, resource } : undefined;
}
