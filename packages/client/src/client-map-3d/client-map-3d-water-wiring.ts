// Builds the 3D map's ocean surface and river overlay with their wiring:
// the ocean calms around river mouths and puts shore foam and a soft beach
// fringe on its coasts,
// and the rivers keep mouth water out of fogged tiles. River mountain
// cascades rebuild with the rivers and animate on the ocean's frame tick.
// Kept out of client-map-3d.ts, which is already far past the file-length
// limit.
import type { Scene } from "three";
import type { Tile, TileVisibilityState } from "../client-types.js";
import { createWaterSurface, type WaterSurface } from "../client-map-3d-water-surface.js";
import { createRiverOverlay, type RiverOverlay, type RiverOverlayDeps } from "../client-map-3d-rivers/client-map-3d-rivers.js";
import { riverMouthCalmCorners } from "../client-map-3d-rivers/client-map-3d-river-mouths.js";
import { createRiverCascades, type RiverCascadeDeps } from "../client-map-3d-rivers/client-map-3d-river-cascade.js";

export type MapWaterDeps = {
  readonly heightfield: RiverOverlayDeps["heightfield"] & RiverCascadeDeps["heightfield"];
  /** The mountain massif's lookup (MountainMassif.lookup), so cascades follow the drawn peaks. */
  readonly mountainLookup: RiverCascadeDeps["mountainLookup"];
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
  // The soft beach fringe continues the heightfield's own coast, so it
  // draws with the heightfield's material and reads its rendered corners.
  const shoreSand = { material: deps.heightfield.material, cornerAt: deps.heightfield.cornerAttributesAt };
  const waterSurface = createWaterSurface(scene, maxTiles, { waveCalmCorners: riverMouthCalmCorners, isLandAt, shoreSand });
  const rivers = createRiverOverlay(scene, { heightfield: deps.heightfield });
  const cascades = createRiverCascades(scene, { heightfield: deps.heightfield, mountainLookup: deps.mountainLookup });
  return {
    waterSurface: {
      ...waterSurface,
      tick: (nowMs) => {
        waterSurface.tick(nowMs);
        cascades.tick(nowMs);
      }
    },
    riverOverlay: {
      rebuild: (inputs) => {
        rivers.rebuild(inputs);
        cascades.rebuild(inputs);
      },
      dispose: () => {
        rivers.dispose();
        cascades.dispose();
      }
    }
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
