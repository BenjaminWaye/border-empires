// The heightfield's per-rebuild tile window, in camera-relative tile
// offsets. Single source of truth: the river valley patches and river water
// (client-map-3d-rivers.ts) must cover exactly the tiles the heightfield
// draws -- the valley used to reach 3 tiles further, leaving loose squares
// of riverbed past the terrain's edge.
export const HEIGHTFIELD_MAX_TILES_PER_AXIS = 240;

export type HeightfieldTileWindow = {
  readonly tileSpanX: number;
  readonly tileSpanY: number;
  /** Camera-relative offset of the window's first tile (tile i is at camX + tileOffsetX + i). */
  readonly tileOffsetX: number;
  readonly tileOffsetY: number;
};

export const heightfieldTileWindow = (halfW: number, halfH: number): HeightfieldTileWindow => {
  const tileSpanX = Math.min(HEIGHTFIELD_MAX_TILES_PER_AXIS, Math.max(2, 2 * halfW + 3));
  const tileSpanY = Math.min(HEIGHTFIELD_MAX_TILES_PER_AXIS, Math.max(2, 2 * halfH + 3));
  return { tileSpanX, tileSpanY, tileOffsetX: -Math.floor(tileSpanX / 2), tileOffsetY: -Math.floor(tileSpanY / 2) };
};

/** True when the tile at camera-relative offset (dx, dz) is inside the window. */
export const isInHeightfieldTileWindow = (w: HeightfieldTileWindow, dx: number, dz: number): boolean =>
  dx >= w.tileOffsetX && dx < w.tileOffsetX + w.tileSpanX && dz >= w.tileOffsetY && dz < w.tileOffsetY + w.tileSpanY;
