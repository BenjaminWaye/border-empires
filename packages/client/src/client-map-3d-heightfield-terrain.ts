// Terrain-kind constants and pure per-tile math (elevation, color, jitter)
// split out of client-map-3d-heightfield.ts (already at the repo's 500-line
// file cap) so the hills dome-mesh rewrite didn't push that file over the
// limit. No mesh-building logic lives here — just the data both
// client-map-3d-heightfield.ts and client-map-3d-hills.ts need to agree on.
import { legacy3DTerrainPalette } from "./client-map-3d-terrain-textures/client-map-3d-terrain-textures.js";

export type HeightfieldTerrainKind = "GRASS" | "SAND" | "TUNDRA" | "MOUNTAIN" | "COASTAL_SEA" | "SEA";

export const HEIGHTFIELD_DEEP_SEA_ELEVATION = -0.36;
export const HEIGHTFIELD_COASTAL_SEA_ELEVATION = -0.16;
export const HEIGHTFIELD_SAND_ELEVATION = 0.07;
export const HEIGHTFIELD_GRASS_ELEVATION = 0.18;
// Slightly raised over GRASS — reads as frost-heaved permafrost ground.
export const HEIGHTFIELD_TUNDRA_ELEVATION = 0.20;
export const HEIGHTFIELD_MOUNTAIN_ELEVATION = 1.15;
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
  }
};

export const wrap = (n: number, dim: number): number => {
  const m = n % dim;
  return m < 0 ? m + dim : m;
};

export const elevationJitter = (wx: number, wy: number, kind: HeightfieldTerrainKind): number => {
  if (kind === "MOUNTAIN") {
    const h = ((wx * 73856093) ^ (wy * 19349663)) >>> 0;
    return ((h % 1024) / 1024 - 0.5) * 0.16;
  }
  if (kind === "GRASS" || kind === "SAND" || kind === "TUNDRA") {
    const h = ((wx * 374761393) ^ (wy * 668265263)) >>> 0;
    return ((h % 1024) / 1024 - 0.5) * 0.05;
  }
  return 0;
};

// Flat elevation ignoring any hills bonus; lets client-map-3d-hills.ts
// blend its dome edges against real jittered neighbours, not a flat seam.
export const heightfieldFlatTileElevation = (wx: number, wy: number, kind: HeightfieldTerrainKind): number =>
  heightfieldTileBaseElevation(kind) + elevationJitter(wx, wy, kind);
