import type { Tile } from "./client-types.js";

export const hasCollectableYield = (tile: Tile | undefined): boolean => {
  if (!tile?.yield) return false;
  if ((tile.yield.gold ?? 0) > 0.01) return true;
  return Object.values(tile.yield.strategic ?? {}).some((value) => Number(value) > 0.01);
};
