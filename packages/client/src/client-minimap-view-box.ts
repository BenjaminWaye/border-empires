import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import type { Tile } from "./client-types.js";

const MINIMAP_VIEW_PADDING_TILES = 8;
const MINIMAP_VIEW_MIN_TILES = 50;

export const computeMiniMapViewBox = (args: {
  tiles: Map<string, Tile>;
  fogDisabled: boolean;
  canvasW: number;
  canvasH: number;
}): { x0: number; y0: number; w: number; h: number } => {
  const fullBox = { x0: 0, y0: 0, w: WORLD_WIDTH, h: WORLD_HEIGHT };
  if (args.fogDisabled || args.tiles.size === 0) return fullBox;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const tile of args.tiles.values()) {
    if (tile.x < minX) minX = tile.x;
    if (tile.y < minY) minY = tile.y;
    if (tile.x > maxX) maxX = tile.x;
    if (tile.y > maxY) maxY = tile.y;
  }
  if (!isFinite(minX) || !isFinite(minY)) return fullBox;
  minX -= MINIMAP_VIEW_PADDING_TILES;
  minY -= MINIMAP_VIEW_PADDING_TILES;
  maxX += MINIMAP_VIEW_PADDING_TILES;
  maxY += MINIMAP_VIEW_PADDING_TILES;
  let boxW = maxX - minX + 1;
  let boxH = maxY - minY + 1;
  if (boxW < MINIMAP_VIEW_MIN_TILES) {
    const grow = (MINIMAP_VIEW_MIN_TILES - boxW) / 2;
    minX -= grow;
    boxW = MINIMAP_VIEW_MIN_TILES;
  }
  if (boxH < MINIMAP_VIEW_MIN_TILES) {
    const grow = (MINIMAP_VIEW_MIN_TILES - boxH) / 2;
    minY -= grow;
    boxH = MINIMAP_VIEW_MIN_TILES;
  }
  const canvasAspect = args.canvasW <= 0 || args.canvasH <= 0 ? 1 : args.canvasW / args.canvasH;
  const boxAspect = boxW / boxH;
  if (boxAspect < canvasAspect) {
    const target = boxH * canvasAspect;
    minX -= (target - boxW) / 2;
    boxW = target;
  } else if (boxAspect > canvasAspect) {
    const target = boxW / canvasAspect;
    minY -= (target - boxH) / 2;
    boxH = target;
  }
  if (boxW >= WORLD_WIDTH) {
    minX = 0;
    boxW = WORLD_WIDTH;
  } else {
    if (minX < 0) minX = 0;
    if (minX + boxW > WORLD_WIDTH) minX = WORLD_WIDTH - boxW;
  }
  if (boxH >= WORLD_HEIGHT) {
    minY = 0;
    boxH = WORLD_HEIGHT;
  } else {
    if (minY < 0) minY = 0;
    if (minY + boxH > WORLD_HEIGHT) minY = WORLD_HEIGHT - boxH;
  }
  return { x0: minX, y0: minY, w: boxW, h: boxH };
};
