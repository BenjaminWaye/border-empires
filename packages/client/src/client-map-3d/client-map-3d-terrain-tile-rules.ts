import type { Tile, TileVisibilityState } from "../client-types.js";
import { isUnexploredCoastRing, touchesLandInSight } from "../client-unexplored-storm/client-unexplored-fog-ring.js";

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
 * terrain then draws those tiles' ground and natural features (fogged like
 * remembered land unless beside land in sight, see hasLiveNeighbour)
 * (no owners, roads or structures: the client has no tile data for them),
 * and the unexplored storm (client-map-3d-unexplored-storm.ts, which keeps
 * using the raw lookup) shrouds most of it behind its brass edge.
 *
 * Build one per terrain rebuild: lookups are memoized for its lifetime (the
 * rebuild asks for each tile many times, and each unexplored tile costs 9
 * raw lookups), which is only valid while visibility can't change.
 */
export const withUnexploredCoastRingAsFogged = (
  visibilityAt: (wx: number, wy: number) => TileVisibilityState,
  wrapX: (x: number) => number,
  wrapY: (y: number) => number
): ((wx: number, wy: number) => TileVisibilityState) => {
  // World coords are well under 2^16 per axis, so this key is collision-free.
  const keyOf = (wx: number, wy: number): number => wy * 65_536 + wx;
  const raw = new Map<number, TileVisibilityState>();
  const rawAt = (wx: number, wy: number): TileVisibilityState => {
    const key = keyOf(wx, wy);
    let visibility = raw.get(key);
    if (visibility === undefined) raw.set(key, (visibility = visibilityAt(wx, wy)));
    return visibility;
  };
  const ring = new Map<number, TileVisibilityState>();
  return (wx, wy) => {
    const key = keyOf(wx, wy);
    const cached = ring.get(key);
    if (cached !== undefined) return cached;
    let visibility = rawAt(wx, wy);
    if (visibility === "unexplored" && isUnexploredCoastRing((ox, oy) => rawAt(wrapX(wx + ox), wrapY(wy + oy)) !== "unexplored")) visibility = "fogged";
    ring.set(key, visibility);
    return visibility;
  };
};

/**
 * Whether any of a tile's 8 neighbours is currently in sight ("visible").
 * A fog-ring tile is fogged like the remembered land it borders unless it
 * touches land in sight -- the same rule as the 2D map (touchesLandInSight).
 */
export const hasLiveNeighbour = (
  visibilityAt: (wx: number, wy: number) => TileVisibilityState,
  wx: number,
  wy: number,
  wrapX: (x: number) => number,
  wrapY: (y: number) => number
): boolean => touchesLandInSight((ox, oy) => visibilityAt(wrapX(wx + ox), wrapY(wy + oy)));
