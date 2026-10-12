import type { TerrainWindow } from "../client-map-3d-terrain-window/client-map-3d-terrain-window.js";
import type { TileVisibilityState } from "../client-types.js";

// Visibility mask behind the 3D unexplored storm, one RGBA texel per tile over
// the built terrain window plus a one-tile ring (texel (i, j) holds tile
// dx = i - halfW - 1, dy = j - halfH - 1 from the window's camX/camY):
//   R -- how unexplored the tile is: 255 = unexplored, 0 = explored, in
//        between while the clouds roll back off it (the reveal animates each
//        tile's exploredness, client-map-3d-unexplored-storm.ts).
//   G -- deep-fog field. A tile's "deepness" is how far it and all 8
//        neighbours are from explored (1 = none explored: deep fog); deep
//        tiles hold 255, the rest a 3x3 tent blur of deepness blended up to
//        their own deepness (outside the window counts as deep). Bilinearly
//        filtered in the shader, the fog's coastline is cut from it, so it
//        runs through the first ring of unexplored tiles and never onto
//        explored land.
//   B -- the reveal's lantern flash, per tile (0 when nothing animates).
//   A -- unused (255); RGBA keeps rows 4-byte aligned.
// With whole tiles (exploredness 0 or 1, no flash) this is the plain
// explored/deep mask; fractional exploredness moves every channel smoothly.
export type UnexploredStormMask = { readonly width: number; readonly height: number; readonly data: Uint8Array };

/** The window's tiles: whether each is explored, and its world key (wy * worldWidth + wx). */
export type UnexploredStormGrid = {
  readonly width: number;
  readonly height: number;
  readonly explored: Uint8Array;
  readonly keys: Int32Array;
};

const TENT = [1, 2, 1, 2, 4, 2, 1, 2, 1] as const;

export const sampleUnexploredStormGrid = (
  window: TerrainWindow,
  worldWidth: number,
  worldHeight: number,
  visibilityAt: (wx: number, wy: number) => TileVisibilityState
): UnexploredStormGrid => {
  const width = window.halfW * 2 + 3;
  const height = window.halfH * 2 + 3;
  const explored = new Uint8Array(width * height);
  const keys = new Int32Array(width * height);
  for (let j = 0; j < height; j += 1) {
    const wy = (((window.camY + j - window.halfH - 1) % worldHeight) + worldHeight) % worldHeight;
    for (let i = 0; i < width; i += 1) {
      const wx = (((window.camX + i - window.halfW - 1) % worldWidth) + worldWidth) % worldWidth;
      explored[j * width + i] = visibilityAt(wx, wy) === "unexplored" ? 0 : 1;
      keys[j * width + i] = wy * worldWidth + wx;
    }
  }
  return { width, height, explored, keys };
};

/**
 * Encodes the mask from each tile's exploredness (0..1) and optional reveal
 * flash (0..1), into `out` when given (it must be width * height * 4 long).
 */
export const encodeUnexploredStormMask = (
  width: number,
  height: number,
  exploredness: Float32Array,
  flash?: Float32Array,
  out: Uint8Array = new Uint8Array(width * height * 4)
): UnexploredStormMask => {
  const exploredAt = (i: number, j: number): number => (i < 0 || j < 0 || i >= width || j >= height ? 0 : exploredness[j * width + i]!);
  const deepness = new Float32Array(width * height);
  for (let j = 0; j < height; j += 1) {
    for (let i = 0; i < width; i += 1) {
      let deep = 1;
      for (let k = 0; k < 9; k += 1) deep *= 1 - exploredAt(i + (k % 3) - 1, j + Math.floor(k / 3) - 1);
      deepness[j * width + i] = deep;
    }
  }
  const deepAt = (i: number, j: number): number => (i < 0 || j < 0 || i >= width || j >= height ? 1 : deepness[j * width + i]!);
  for (let j = 0; j < height; j += 1) {
    for (let i = 0; i < width; i += 1) {
      const t = j * width + i;
      let sum = 0;
      for (let k = 0; k < 9; k += 1) sum += TENT[k]! * deepAt(i + (k % 3) - 1, j + Math.floor(k / 3) - 1);
      const tent = sum / 16;
      const own = deepness[t]!;
      out[t * 4] = Math.round((1 - exploredness[t]!) * 255);
      out[t * 4 + 1] = Math.round((tent + (1 - tent) * own) * 255);
      out[t * 4 + 2] = flash ? Math.round(flash[t]! * 255) : 0;
      out[t * 4 + 3] = 255;
    }
  }
  return { width, height, data: out };
};

/** The plain mask (whole tiles, no reveal in progress). */
export const buildUnexploredStormMask = (
  window: TerrainWindow,
  worldWidth: number,
  worldHeight: number,
  visibilityAt: (wx: number, wy: number) => TileVisibilityState
): UnexploredStormMask => {
  const grid = sampleUnexploredStormGrid(window, worldWidth, worldHeight, visibilityAt);
  return encodeUnexploredStormMask(grid.width, grid.height, Float32Array.from(grid.explored));
};
