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
import { createShoreSandLayer, EMPTY_SHORE_FRINGE, SHORE_SAND_SUBDIV, SHORE_SAND_SUBDIV_FAR, type ShoreFringe } from "./client-map-3d-shore-sand.js";
import { createShoreWaterline } from "./client-map-3d-shore-waterline.js";

// Foam would be sub-pixel this far out (window wider than this many tiles).
// The sand fringe is never gated: it changes the coast's shape, and the
// window size (the box around the sea in view) swings either side of any
// threshold while panning, which flipped coasts between curved and square.
const SHORE_FOAM_MAX_WINDOW_TILES = 140;
// Past this width the fringe drops to its coarse sample grid: it keeps its
// curve (so no curved/square flip), just with fewer vertices. Lower than the
// foam's cut-off on purpose: the fine grid costs ~2.5x the coarse one per
// rebuild (main thread), and at 100+ tiles across a tile is a few pixels, so
// the foam tracing the fine waterline round the coarse fringe doesn't show.
const SHORE_SAND_FINE_MAX_WINDOW_TILES = 100;

export type ShoreSandWiring = {
  /** The heightfield's own material, so the fringe continues the beach exactly. */
  readonly material: Material;
  /** The heightfield's rendered corner at absolute world corner (x, z). */
  readonly cornerAt: (worldX: number, worldZ: number, out: HeightfieldCornerAttributes) => boolean;
  /** Handed each commit's fringe, so tile overlays can extend over it (client-map-3d-ownership-shore.ts). */
  readonly onFringe?: (fringe: ShoreFringe) => void;
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
    if (!commit) {
      foam.rebuild([], () => false, 0, false);
      sand?.clear();
      sandWiring?.onFringe?.(EMPTY_SHORE_FRINGE);
      return;
    }
    const { tiles, isLandTile, worldOffsetX, worldOffsetZ, waterY, mouths } = commit;
    const waterline = sand ? createShoreWaterline(isLandTile, worldOffsetX, worldOffsetZ, mouths) : undefined;
    const foamEnabled = commit.windowTiles <= SHORE_FOAM_MAX_WINDOW_TILES;
    foam.rebuild(tiles, isLandTile, waterY + FOAM_LIFT_Y, foamEnabled, mouths, waterline);
    if (!sand || !sandWiring || !waterline) return;
    const fringe = sand.rebuild(tiles, {
      isLandTile,
      subdiv: commit.windowTiles <= SHORE_SAND_FINE_MAX_WINDOW_TILES ? SHORE_SAND_SUBDIV : SHORE_SAND_SUBDIV_FAR,
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
    sandWiring.onFringe?.(fringe);
  };

  const dispose = (): void => {
    foam.dispose();
    sand?.dispose();
  };

  return { rebuild, dispose };
};
