import type { Tile, TileVisibilityState } from "../client-types.js";

// Small per-tile helpers for client-map-3d.ts's terrain rebuild, extracted
// to keep that file from growing.

/**
 * Whether the sea tile at (wx, wy) draws as shallow water: any land or
 * mountain within Chebyshev radius 2.
 */
export const isShallowSeaTile = (
  wx: number,
  wy: number,
  terrainAt: (wx: number, wy: number) => Tile["terrain"],
  wrapX: (x: number) => number,
  wrapY: (y: number) => number
): boolean => {
  for (let nz = -2; nz <= 2; nz += 1) {
    for (let nx = -2; nx <= 2; nx += 1) {
      if (nx === 0 && nz === 0) continue;
      const nt = terrainAt(wrapX(wx + nx), wrapY(wy + nz));
      if (nt === "LAND" || nt === "MOUNTAIN") return true;
    }
  }
  return false;
};

/**
 * Wraps a visibility lookup so the fog's first ring -- unexplored tiles with
 * an explored tile among their 8 neighbours -- reports "fogged". The 3D
 * terrain then draws those tiles' ground dimmed like remembered terrain
 * (no owners, roads or structures: the client has no tile data for them),
 * and the unexplored storm (client-map-3d-unexplored-storm.ts, which keeps
 * using the raw lookup) lays its see-through parchment coast band over it.
 */
export const withUnexploredCoastRingAsFogged = (
  visibilityAt: (wx: number, wy: number) => TileVisibilityState,
  wrapX: (x: number) => number,
  wrapY: (y: number) => number
): ((wx: number, wy: number) => TileVisibilityState) => (wx, wy) => {
  const visibility = visibilityAt(wx, wy);
  if (visibility !== "unexplored") return visibility;
  for (let k = 0; k < 9; k += 1) {
    if (k === 4) continue;
    if (visibilityAt(wrapX(wx + (k % 3) - 1), wrapY(wy + Math.floor(k / 3) - 1)) !== "unexplored") return "fogged";
  }
  return visibility;
};
