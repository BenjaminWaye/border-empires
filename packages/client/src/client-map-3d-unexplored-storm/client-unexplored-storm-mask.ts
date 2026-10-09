import type { TerrainWindow } from "../client-map-3d-terrain-window/client-map-3d-terrain-window.js";

// Explored mask behind the 3D unexplored storm: one byte per tile over the
// built terrain window plus a one-tile ring (texel (i, j) holds tile
// dx = i - halfW - 1, dy = j - halfH - 1 from the window's camX/camY);
// 255 = unexplored, 0 = explored. The shader reads it at tile centres (this
// tile and its 8 neighbours) to cover only unexplored tiles and to measure
// the distance to explored land for the border band.
export type UnexploredStormMask = { readonly width: number; readonly height: number; readonly data: Uint8Array };

export const buildUnexploredStormMask = (
  window: TerrainWindow,
  worldWidth: number,
  worldHeight: number,
  isExploredAt: (wx: number, wy: number) => boolean
): UnexploredStormMask => {
  const width = window.halfW * 2 + 3;
  const height = window.halfH * 2 + 3;
  const data = new Uint8Array(width * height);
  for (let j = 0; j < height; j += 1) {
    const wy = (((window.camY + j - window.halfH - 1) % worldHeight) + worldHeight) % worldHeight;
    for (let i = 0; i < width; i += 1) {
      const wx = (((window.camX + i - window.halfW - 1) % worldWidth) + worldWidth) % worldWidth;
      data[j * width + i] = isExploredAt(wx, wy) ? 0 : 255;
    }
  }
  return { width, height, data };
};
