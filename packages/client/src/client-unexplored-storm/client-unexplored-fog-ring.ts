import type { TileVisibilityState } from "../client-types.js";

// The fog's first-ring rules, shared by both renderers so the 2D canvas
// (client-map-render-2d-tile-ground.ts) and the true-3D map
// (client-map-3d-terrain-tile-rules.ts) can't drift apart. Neighbours are
// addressed by offset (ox, oy) in -1..1; callers handle world wrap.

/** Whether (from its 8 neighbours) an unexplored tile is on the fog's first ring. */
export const isUnexploredCoastRing = (isExploredAt: (ox: number, oy: number) => boolean): boolean => {
  for (let k = 0; k < 9; k += 1) if (k !== 4 && isExploredAt((k % 3) - 1, Math.floor(k / 3) - 1)) return true;
  return false;
};

/**
 * Whether any of a tile's 8 neighbours is in sight. A ring tile prints like
 * the remembered land it borders unless it touches land in sight, so the
 * ring never shows a full-colour strip against faded remembered tiles.
 */
export const touchesLandInSight = (neighbourVisibility: (ox: number, oy: number) => TileVisibilityState): boolean => {
  for (let k = 0; k < 9; k += 1) if (k !== 4 && neighbourVisibility((k % 3) - 1, Math.floor(k / 3) - 1) === "visible") return true;
  return false;
};
