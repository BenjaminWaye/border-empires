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
//   B -- 255 = remembered ("fogged": explored, not in sight). These get the
//        same hatching as the fog ring -- hatching means "not in sight".
//   A -- unused (255); RGBA keeps rows 4-byte aligned.
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
  const fogged = new Uint8Array(width * height);
  for (let j = 0; j < height; j += 1) {
    const wy = (((window.camY + j - window.halfH - 1) % worldHeight) + worldHeight) % worldHeight;
    for (let i = 0; i < width; i += 1) {
      const wx = (((window.camX + i - window.halfW - 1) % worldWidth) + worldWidth) % worldWidth;
      const visibility = visibilityAt(wx, wy);
      explored[j * width + i] = visibility === "unexplored" ? 0 : 1;
      fogged[j * width + i] = visibility === "fogged" ? 1 : 0;
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
      data[at + 2] = fogged[j * width + i] ? 255 : 0;
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
