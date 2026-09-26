// Forest-halo strength for the heightfield's "darker grass near trees" look,
// extracted from client-map-3d-heightfield.ts (over the 500-line cap).
import { wrap } from "../client-map-3d-heightfield-terrain.js";

const FOREST_HALO_RADIUS = 2;

// 1 if this tile or any tile within FOREST_HALO_RADIUS is a forest, else 0.
// Cheap toroidal Chebyshev-disc scan; the early-exit on the first hit
// keeps cost low even at the radius=2 (5×5 = 25 lookups worst case).
export const forestHaloAt = (
  wx: number,
  wy: number,
  forestAt: (wx: number, wy: number) => boolean,
  worldWidth: number,
  worldHeight: number
): number => {
  for (let dy = -FOREST_HALO_RADIUS; dy <= FOREST_HALO_RADIUS; dy += 1) {
    for (let dx = -FOREST_HALO_RADIUS; dx <= FOREST_HALO_RADIUS; dx += 1) {
      if (forestAt(wrap(wx + dx, worldWidth), wrap(wy + dy, worldHeight))) return 1;
    }
  }
  return 0;
};
