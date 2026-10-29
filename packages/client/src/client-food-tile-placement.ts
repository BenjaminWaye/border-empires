// One of 0, 90, 180, 270 degrees, stable per world tile.
export const farmlandYawAt = (worldX: number, worldZ: number): number => {
  let h = (worldX * 374761393) ^ (worldZ * 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return ((h % 4) * Math.PI) / 2;
};

export type WaterDirection = { readonly dx: number; readonly dy: number };

const CARDINALS: ReadonlyArray<WaterDirection> = [{ dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 0, dy: -1 }];
const DIAGONALS: ReadonlyArray<WaterDirection> = [{ dx: 1, dy: 1 }, { dx: -1, dy: 1 }, { dx: -1, dy: -1 }, { dx: 1, dy: -1 }];

/** The direction from world tile (wx, wy) towards water: an edge-adjacent
 * water tile if any, else a corner-adjacent one, else undefined. When
 * several qualify the choice is stable per tile, so a site doesn't spin as
 * the camera pans. */
export const fishingWaterDirection = (isWaterAt: (wx: number, wy: number) => boolean, wx: number, wy: number): WaterDirection | undefined => {
  for (const group of [CARDINALS, DIAGONALS]) {
    const wet = group.filter((d) => isWaterAt(wx + d.dx, wy + d.dy));
    if (wet.length > 0) return wet[Math.floor((farmlandYawAt(wx, wy) / (Math.PI / 2)) % wet.length)];
  }
  return undefined;
};

/** Yaw that turns the model's water side (local +x) towards `water`; with no
 * water nearby, falls back to a random quarter turn stable per tile. */
export const fishingYawFor = (water: WaterDirection | undefined, wx: number, wy: number): number =>
  water ? Math.atan2(-water.dy, water.dx) : farmlandYawAt(wx, wy);

/** Keep diagonal placements inside their tile after the apron rotates 45 degrees. */
export const fishingSiteOffset = (water: WaterDirection | undefined): number =>
  !water ? 0 : water.dx !== 0 && water.dy !== 0 ? 0.01 : 0.132;
