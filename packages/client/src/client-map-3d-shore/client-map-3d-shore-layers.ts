// The ocean's coastline dressing, rebuilt on every water commit
// (client-map-3d-water-surface.ts): shore foam on the sea (client-map-3d-shore.ts)
// and, when the heightfield is wired in, the soft beach fringe
// (client-map-3d-shore-sand.ts) whose rounded edge the foam then follows.
// Kept together so the water surface hands over one commit's coastline in a
// single call, and so the foam and fringe always agree on where the
// waterline is.
import type { Material, Scene } from "three";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import type { HeightfieldCornerAttributes } from "../client-map-3d-heightfield/client-map-3d-heightfield-corners.js";
import { RENDER_ORDER } from "../client-map-3d-render-order.js";
import { createShoreFoamLayer, FOAM_LIFT_Y } from "./client-map-3d-shore.js";
import { createShoreSandLayer, createShoreWaterline } from "./client-map-3d-shore-sand.js";

// Foam and fringe would be sub-pixel this far out (window wider than this many tiles).
const SHORE_MAX_WINDOW_TILES = 140;

export type ShoreSandWiring = {
  /** The heightfield's own material, so the fringe continues the beach exactly. */
  readonly material: Material;
  /** The heightfield's rendered corner at absolute world corner (x, z). */
  readonly cornerAt: (worldX: number, worldZ: number, out: HeightfieldCornerAttributes) => boolean;
};

export type ShoreCommit = {
  /** This commit's water tiles, scene grid coords. */
  readonly tiles: ReadonlyArray<{ readonly gc: number; readonly gr: number }>;
  readonly isLandTile: (gc: number, gr: number) => boolean;
  /** Width/height of the committed window, in tiles. */
  readonly windowTiles: number;
  /** Scene grid -> absolute world grid. */
  readonly worldOffsetX: number;
  readonly worldOffsetZ: number;
  readonly waterY: number;
  /** River mouth corners in scene coords; foam and fringe both stand clear of them. */
  readonly mouths: ReadonlyArray<{ readonly x: number; readonly z: number }>;
};

export type ShoreLayers = {
  /** `null` clears the coastline (no sea in view, or no land lookup to find it). */
  readonly rebuild: (commit: ShoreCommit | null) => void;
  readonly dispose: () => void;
};

export const createShoreLayers = (scene: Scene, sandWiring: ShoreSandWiring | undefined): ShoreLayers => {
  const foam = createShoreFoamLayer(scene, RENDER_ORDER.shoreFoam);
  const sand = sandWiring ? createShoreSandLayer(scene, sandWiring.material) : null;

  const rebuild: ShoreLayers["rebuild"] = (commit) => {
    if (!commit || commit.windowTiles > SHORE_MAX_WINDOW_TILES) {
      foam.rebuild([], () => false, 0, false);
      sand?.clear();
      return;
    }
    const { tiles, isLandTile, worldOffsetX, worldOffsetZ, waterY, mouths } = commit;
    const waterline = sand ? createShoreWaterline(isLandTile, worldOffsetX, worldOffsetZ, mouths) : undefined;
    foam.rebuild(tiles, isLandTile, waterY + FOAM_LIFT_Y, true, mouths, waterline);
    if (!sand || !sandWiring || !waterline) return;
    sand.rebuild(tiles, {
      isLandTile,
      worldOffsetX,
      worldOffsetZ,
      waterY,
      waterline,
      cornerAt: (x, z, out) => {
        const wx = (((x + worldOffsetX) % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH;
        const wz = (((z + worldOffsetZ) % WORLD_HEIGHT) + WORLD_HEIGHT) % WORLD_HEIGHT;
        return sandWiring.cornerAt(wx, wz, out);
      }
    });
  };

  const dispose = (): void => {
    foam.dispose();
    sand?.dispose();
  };

  return { rebuild, dispose };
};
