// Builds the 3D map's ocean surface and river overlay with their wiring:
// the ocean calms around river mouths and puts shore foam on its coasts,
// and the rivers keep mouth water out of fogged tiles. Kept out of
// client-map-3d.ts, which is already far past the file-length limit.
import type { Scene } from "three";
import type { Tile, TileVisibilityState } from "../client-types.js";
import { createWaterSurface, type WaterSurface } from "../client-map-3d-water-surface.js";
import { createRiverOverlay, type RiverOverlay, type RiverOverlayDeps } from "../client-map-3d-rivers/client-map-3d-rivers.js";
import { riverMouthCalmCorners } from "../client-map-3d-rivers/client-map-3d-river-mouths.js";

export type MapWaterDeps = {
  readonly heightfield: RiverOverlayDeps["heightfield"];
  readonly wrapX: (x: number) => number;
  readonly wrapY: (y: number) => number;
  readonly terrainAt: (x: number, y: number) => Tile["terrain"];
};

export type MapWater = { readonly waterSurface: WaterSurface; readonly riverOverlay: RiverOverlay };

export const createMapWater = (scene: Scene, maxTiles: number, deps: MapWaterDeps): MapWater => {
  const isLandAt = (x: number, z: number): boolean => {
    const terrain = deps.terrainAt(deps.wrapX(x), deps.wrapY(z));
    return terrain !== "SEA" && terrain !== "COASTAL_SEA";
  };
  return {
    waterSurface: createWaterSurface(scene, maxTiles, { waveCalmCorners: riverMouthCalmCorners, isLandAt }),
    riverOverlay: createRiverOverlay(scene, { heightfield: deps.heightfield })
  };
};

/**
 * Fogged-tile predicate for the river overlay (tiles the fog-darken layer
 * covers); none when the whole map is revealed.
 */
export const riverFoggedAt = (
  revealWholeMap: boolean,
  visibilityAt: (wx: number, wy: number) => TileVisibilityState
): ((wx: number, wy: number) => boolean) =>
  revealWholeMap ? () => false : (wx, wy) => visibilityAt(wx, wy) === "fogged";
