import type { TerrainWindow } from "../client-map-3d-terrain-window/client-map-3d-terrain-window.js";
import type { TileVisibilityState } from "../client-types.js";

// Visibility mask behind the 3D unexplored storm, one RGBA texel per tile over
// the built terrain window plus a one-tile ring (texel (i, j) holds tile
// dx = i - halfW - 1, dy = j - halfH - 1 from the window's camX/camY):
//   R -- 255 = unexplored. Read at tile centres: the storm layer only ever
//        draws on these tiles.
//   G -- deep-fog field. A tile is "deep" when it's unexplored and none of
//        its 8 neighbours is explored; deep tiles hold 255, every other tile
//        a 3x3 tent blur of deepness (outside the window counts as deep).
//        Bilinearly filtered in the shader, the fog's coastline is cut from
//        it, so it runs through the first ring of unexplored tiles and never
//        onto explored land.
//   B, A -- unused (0, 255); RGBA keeps rows 4-byte aligned.
export type UnexploredStormMask = { readonly width: number; readonly height: number; readonly data: Uint8Array };

const TENT = [1, 2, 1, 2, 4, 2, 1, 2, 1] as const;

export const buildUnexploredStormMask = (
  window: TerrainWindow,
  worldWidth: number,
  worldHeight: number,
  visibilityAt: (wx: number, wy: number) => TileVisibilityState
): UnexploredStormMask => {
  const width = window.halfW * 2 + 3;
  const height = window.halfH * 2 + 3;
  const explored = new Uint8Array(width * height);
  for (let j = 0; j < height; j += 1) {
    const wy = (((window.camY + j - window.halfH - 1) % worldHeight) + worldHeight) % worldHeight;
    for (let i = 0; i < width; i += 1) {
      const wx = (((window.camX + i - window.halfW - 1) % worldWidth) + worldWidth) % worldWidth;
      explored[j * width + i] = visibilityAt(wx, wy) === "unexplored" ? 0 : 1;
    }
  }
  const exploredAt = (i: number, j: number): number => (i < 0 || j < 0 || i >= width || j >= height ? 0 : explored[j * width + i]!);
  const deep = new Uint8Array(width * height);
  for (let j = 0; j < height; j += 1) {
    for (let i = 0; i < width; i += 1) {
      let nearExplored = 0;
      for (let k = 0; k < 9; k += 1) nearExplored |= exploredAt(i + (k % 3) - 1, j + Math.floor(k / 3) - 1);
      deep[j * width + i] = nearExplored ? 0 : 1;
    }
  }
  const deepAt = (i: number, j: number): number => (i < 0 || j < 0 || i >= width || j >= height ? 1 : deep[j * width + i]!);
  const data = new Uint8Array(width * height * 4);
  for (let j = 0; j < height; j += 1) {
    for (let i = 0; i < width; i += 1) {
      const at = (j * width + i) * 4;
      data[at] = explored[j * width + i] ? 0 : 255;
      data[at + 3] = 255;
      if (deep[j * width + i]) {
        data[at + 1] = 255;
        continue;
      }
      let sum = 0;
      for (let k = 0; k < 9; k += 1) sum += TENT[k]! * deepAt(i + (k % 3) - 1, j + Math.floor(k / 3) - 1);
      data[at + 1] = Math.round((sum / 16) * 255);
    }
  }
  return { width, height, data };
};

/**
 * How many tiles are explored in `next` but were unexplored in `prev`
 * (matched by world position across the two windows, toroidally wrapped;
 * tiles outside `prev`'s window don't count -- they're new to the window,
 * not newly explored). Drives the 3D storm's reveal animation, so plain
 * camera pans (same tiles, new window) never trigger it.
 */
export const countNewlyExplored = (
  prev: { readonly window: TerrainWindow; readonly mask: UnexploredStormMask },
  next: { readonly window: TerrainWindow; readonly mask: UnexploredStormMask },
  worldWidth: number,
  worldHeight: number
): number => {
  const wrapDelta = (d: number, size: number): number => ((((d % size) + size + size / 2) % size) - size / 2);
  const shiftX = wrapDelta(next.window.camX - next.window.halfW - (prev.window.camX - prev.window.halfW), worldWidth);
  const shiftY = wrapDelta(next.window.camY - next.window.halfH - (prev.window.camY - prev.window.halfH), worldHeight);
  let count = 0;
  for (let j = 0; j < next.mask.height; j += 1) {
    const pj = j + shiftY;
    if (pj < 0 || pj >= prev.mask.height) continue;
    for (let i = 0; i < next.mask.width; i += 1) {
      const pi = i + shiftX;
      if (pi < 0 || pi >= prev.mask.width) continue;
      const nowExplored = next.mask.data[(j * next.mask.width + i) * 4] === 0;
      const wasUnexplored = prev.mask.data[(pj * prev.mask.width + pi) * 4] === 255;
      if (nowExplored && wasUnexplored) count += 1;
    }
  }
  return count;
};
