import type { TerrainWindow } from "../client-map-3d-terrain-window/client-map-3d-terrain-window.js";

// Explored mask behind the 3D unexplored storm, one RG texel per tile over
// the built terrain window plus a one-tile ring (texel (i, j) holds tile
// dx = i - halfW - 1, dy = j - halfH - 1 from the window's camX/camY):
//   R -- hard: 255 = unexplored. Read at the texel centre, so every
//        unexplored tile is always fully covered by cloud.
//   G -- soft: on unexplored tiles, a 3x3 tent blur of explored-ness
//        (outside the window counts as unexplored); 1 on explored tiles.
//        Bilinearly filtered in the shader: ~0.6 on a straight fog border,
//        falling to 0 about 1.5 tiles into the fog -- the gradient the
//        parchment band and foam rim inside unexplored tiles are cut from.
export type UnexploredStormMask = { readonly width: number; readonly height: number; readonly data: Uint8Array };

const TENT = [1, 2, 1, 2, 4, 2, 1, 2, 1] as const;

export const buildUnexploredStormMask = (
  window: TerrainWindow,
  worldWidth: number,
  worldHeight: number,
  isExploredAt: (wx: number, wy: number) => boolean
): UnexploredStormMask => {
  const width = window.halfW * 2 + 3;
  const height = window.halfH * 2 + 3;
  const hard = new Uint8Array(width * height);
  for (let j = 0; j < height; j += 1) {
    const wy = (((window.camY + j - window.halfH - 1) % worldHeight) + worldHeight) % worldHeight;
    for (let i = 0; i < width; i += 1) {
      const wx = (((window.camX + i - window.halfW - 1) % worldWidth) + worldWidth) % worldWidth;
      hard[j * width + i] = isExploredAt(wx, wy) ? 0 : 1;
    }
  }
  const data = new Uint8Array(width * height * 2);
  for (let j = 0; j < height; j += 1) {
    for (let i = 0; i < width; i += 1) {
      let sum = 0;
      for (let k = 0; k < 9; k += 1) {
        const ni = i + (k % 3) - 1;
        const nj = j + Math.floor(k / 3) - 1;
        const outside = ni < 0 || nj < 0 || ni >= width || nj >= height;
        sum += TENT[k]! * (outside ? 0 : 1 - hard[nj * width + ni]!);
      }
      const at = (j * width + i) * 2;
      const unexplored = hard[j * width + i] === 1;
      data[at] = unexplored ? 255 : 0;
      // Explored tiles saturate, so the band's contour rounds an explored
      // corner instead of notching it square.
      data[at + 1] = unexplored ? Math.round((sum / 16) * 255) : 255;
    }
  }
  return { width, height, data };
};
