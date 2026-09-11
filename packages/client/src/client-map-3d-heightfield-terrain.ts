// Terrain-kind constants and pure per-tile math (elevation, color, jitter)
// split out of client-map-3d-heightfield.ts (already at the repo's 500-line
// file cap) so the hills dome-mesh rewrite didn't push that file over the
// limit. No mesh-building logic lives here — just the data both
// client-map-3d-heightfield.ts and client-map-3d-hills.ts need to agree on.
import { legacy3DTerrainPalette } from "./client-map-3d-terrain-textures/client-map-3d-terrain-textures.js";

export type HeightfieldTerrainKind =
  | "GRASS"
  | "SAND"
  | "TUNDRA"
  | "MOUNTAIN"
  | "COASTAL_SEA"
  | "SEA"
  | "PLAINS"
  | "JUNGLE"
  | "MARSH"
  | "SNOW";

export const HEIGHTFIELD_DEEP_SEA_ELEVATION = -0.36;
export const HEIGHTFIELD_COASTAL_SEA_ELEVATION = -0.16;
export const HEIGHTFIELD_SAND_ELEVATION = 0.07;
export const HEIGHTFIELD_GRASS_ELEVATION = 0.18;
// Slightly raised over GRASS — reads as frost-heaved permafrost ground.
export const HEIGHTFIELD_TUNDRA_ELEVATION = 0.20;
export const HEIGHTFIELD_MOUNTAIN_ELEVATION = 1.15;
// v8 cosmetic-only biomes (visualLandBiomeAt promotions) sit at their
// mechanical parent's elevation: PLAINS/JUNGLE/MARSH promote from GRASS,
// SNOW promotes from TUNDRA -- only ground color changes, not terrain shape.
export const HEIGHTFIELD_PLAINS_ELEVATION = HEIGHTFIELD_GRASS_ELEVATION;
export const HEIGHTFIELD_JUNGLE_ELEVATION = HEIGHTFIELD_GRASS_ELEVATION;
export const HEIGHTFIELD_MARSH_ELEVATION = HEIGHTFIELD_GRASS_ELEVATION;
export const HEIGHTFIELD_SNOW_ELEVATION = HEIGHTFIELD_TUNDRA_ELEVATION;
// A hills tile's peak elevation. Hills aren't rendered by the main grid at
// all (client-map-3d-hills.ts draws a dome instead), kept below
// HEIGHTFIELD_MOUNTAIN_ELEVATION as a lesser landform.
export const HEIGHTFIELD_HILLS_ELEVATION_BONUS = 0.45;

export const heightfieldTileBaseElevation = (kind: HeightfieldTerrainKind): number => {
  switch (kind) {
    case "MOUNTAIN":
      return HEIGHTFIELD_MOUNTAIN_ELEVATION;
    case "GRASS":
      return HEIGHTFIELD_GRASS_ELEVATION;
    case "SAND":
      return HEIGHTFIELD_SAND_ELEVATION;
    case "TUNDRA":
      return HEIGHTFIELD_TUNDRA_ELEVATION;
    case "COASTAL_SEA":
      return HEIGHTFIELD_COASTAL_SEA_ELEVATION;
    case "SEA":
      return HEIGHTFIELD_DEEP_SEA_ELEVATION;
    case "PLAINS":
      return HEIGHTFIELD_PLAINS_ELEVATION;
    case "JUNGLE":
      return HEIGHTFIELD_JUNGLE_ELEVATION;
    case "MARSH":
      return HEIGHTFIELD_MARSH_ELEVATION;
    case "SNOW":
      return HEIGHTFIELD_SNOW_ELEVATION;
  }
};

const MOUNTAIN_ROCK_LIGHT: [number, number, number] = [128, 120, 124];
const MOUNTAIN_ROCK_DARK: [number, number, number] = [98, 92, 96];
const GRASS_TINT_DEEP: [number, number, number] = legacy3DTerrainPalette.grassDark;
const GRASS_TINT_LIGHT: [number, number, number] = legacy3DTerrainPalette.grassLight;
// Pale frost blue-grey-green — matches the 2D minimap's TUNDRA tone (client-map-facade.ts).
const TUNDRA_TINT_DEEP: [number, number, number] = [169, 188, 184];
const TUNDRA_TINT_LIGHT: [number, number, number] = [182, 200, 194];
// Distinct turquoise for the shoreline so it reads clearly through the
// transparent water plane and contrasts with the darker deep-sea floor.
const COASTAL_SEA_FLOOR: [number, number, number] = [188, 162, 112];
const DEEP_SEA_FLOOR: [number, number, number] = [42, 78, 110];
// v8 biomes reuse the GRASS/TUNDRA painted textures (their vertex color
// stays green/pale enough to hit the shader's grass/tundra blend paths) —
// only the vertex-color tint differs, so each still reads as visually
// distinct ground: golden plains, deep jungle green, murky marsh olive,
// and a near-white snow cap over the pale tundra texture.
const PLAINS_TINT_DEEP: [number, number, number] = [163, 152, 82];
const PLAINS_TINT_LIGHT: [number, number, number] = [184, 172, 96];
const JUNGLE_TINT_DEEP: [number, number, number] = [40, 92, 46];
const JUNGLE_TINT_LIGHT: [number, number, number] = [54, 112, 58];
const MARSH_TINT_DEEP: [number, number, number] = [86, 100, 68];
const MARSH_TINT_LIGHT: [number, number, number] = [100, 114, 80];
const SNOW_TINT: [number, number, number] = [232, 238, 240];

// Exported so client-map-3d-hills.ts can stitch its dome's edges to a real
// neighbour's exact colour instead of a single fixed grass/sand tint.
export const heightfieldTileColor = (
  kind: HeightfieldTerrainKind,
  variant: 0 | 1 | 2
): [number, number, number] => {
  switch (kind) {
    case "MOUNTAIN":
      return variant === 0 ? MOUNTAIN_ROCK_DARK : MOUNTAIN_ROCK_LIGHT;
    case "GRASS":
      return variant === 0 ? GRASS_TINT_DEEP : variant === 1 ? GRASS_TINT_LIGHT : GRASS_TINT_DEEP;
    case "SAND":
      return legacy3DTerrainPalette.sand;
    case "TUNDRA":
      return variant === 0 ? TUNDRA_TINT_DEEP : variant === 1 ? TUNDRA_TINT_LIGHT : TUNDRA_TINT_DEEP;
    case "COASTAL_SEA":
      return COASTAL_SEA_FLOOR;
    case "SEA":
      return DEEP_SEA_FLOOR;
    case "PLAINS":
      return variant === 0 ? PLAINS_TINT_DEEP : variant === 1 ? PLAINS_TINT_LIGHT : PLAINS_TINT_DEEP;
    case "JUNGLE":
      return variant === 0 ? JUNGLE_TINT_DEEP : variant === 1 ? JUNGLE_TINT_LIGHT : JUNGLE_TINT_DEEP;
    case "MARSH":
      return variant === 0 ? MARSH_TINT_DEEP : variant === 1 ? MARSH_TINT_LIGHT : MARSH_TINT_DEEP;
    case "SNOW":
      return SNOW_TINT;
  }
};

export const wrap = (n: number, dim: number): number => {
  const m = n % dim;
  return m < 0 ? m + dim : m;
};

// A slow-wavelength (~100+ tile period) undulation layered under the sharp
// per-tile jitter below, so flat land reads as gently rolling terrain rather
// than a dead-flat plane with pixel-scale noise. Adjacent tiles share almost
// the same value at this wavelength, so it blends smoothly through the
// heightfield's existing corner-averaging with no visible seams.
const rollingTerrainWave = (wx: number, wy: number): number =>
  (Math.sin(wx * 0.045 + wy * 0.031) + Math.cos(wx * 0.028 - wy * 0.052)) * 0.0175;

export const elevationJitter = (wx: number, wy: number, kind: HeightfieldTerrainKind): number => {
  if (kind === "MOUNTAIN") {
    const h = ((wx * 73856093) ^ (wy * 19349663)) >>> 0;
    return ((h % 1024) / 1024 - 0.5) * 0.16;
  }
  if (
    kind === "GRASS" ||
    kind === "SAND" ||
    kind === "TUNDRA" ||
    kind === "PLAINS" ||
    kind === "JUNGLE" ||
    kind === "MARSH" ||
    kind === "SNOW"
  ) {
    const h = ((wx * 374761393) ^ (wy * 668265263)) >>> 0;
    return ((h % 1024) / 1024 - 0.5) * 0.05 + rollingTerrainWave(wx, wy);
  }
  return 0;
};

// Flat elevation ignoring any hills bonus; lets client-map-3d-hills.ts
// blend its dome edges against real jittered neighbours, not a flat seam.
export const heightfieldFlatTileElevation = (wx: number, wy: number, kind: HeightfieldTerrainKind): number =>
  heightfieldTileBaseElevation(kind) + elevationJitter(wx, wy, kind);

// A "coast corner" vertex (some explored sea + some explored land touching
// it) is normally pinned flush to coastEdgeY so flat land bevels smoothly
// into the water. When a hill sits on the land side, that pin sinks the
// corner tens of units below the hill dome's actual surface — anything
// anchored via cornerYAt at that corner (the ownership overlay's draped
// hill tint, gridlines) ends up buried inside the terrain and invisible,
// which is why a settled coastal hill's ownership colour can appear to
// never render. Tapering to the hills' own base elevation (bonus
// subtracted, matching the dome's tapered-to-zero edge) instead keeps the
// corner near the dome surface while still never rising above it.
export const coastCornerElevation = (
  s00: { elevation: number; isExplored: boolean; isHills: boolean },
  s10: { elevation: number; isExplored: boolean; isHills: boolean },
  s01: { elevation: number; isExplored: boolean; isHills: boolean },
  s11: { elevation: number; isExplored: boolean; isHills: boolean },
  coastEdgeY: number
): number => {
  const hills = [s00, s10, s01, s11].filter((s) => s.isExplored && s.isHills);
  if (hills.length === 0) return coastEdgeY;
  const avg = hills.reduce((sum, s) => sum + (s.elevation - HEIGHTFIELD_HILLS_ELEVATION_BONUS), 0) / hills.length;
  return Math.max(coastEdgeY, avg);
};
