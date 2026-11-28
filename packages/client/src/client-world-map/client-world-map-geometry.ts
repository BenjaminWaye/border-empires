// Where the whole world sits on the world map's canvas, which tile a tap lands on, and the player's view
// rectangle in world tiles (split at the world's edge, since the world wraps on both axes).

import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";

export type Rect = { x: number; y: number; w: number; h: number };

/** The world's rectangle, kept at its own aspect and centred in a w x h area (letterboxed). */
export const fitWorldRect = (areaW: number, areaH: number, worldW = WORLD_WIDTH, worldH = WORLD_HEIGHT): Rect => {
  if (areaW <= 0 || areaH <= 0) return { x: 0, y: 0, w: 0, h: 0 };
  const scale = Math.min(areaW / worldW, areaH / worldH);
  const w = worldW * scale;
  const h = worldH * scale;
  return { x: (areaW - w) / 2, y: (areaH - h) / 2, w, h };
};

/** The tile under a point of the area, or undefined when the point is outside the world's rectangle. */
export const worldTileAtPoint = (
  px: number,
  py: number,
  rect: Rect,
  worldW = WORLD_WIDTH,
  worldH = WORLD_HEIGHT
): { x: number; y: number } | undefined => {
  if (rect.w <= 0 || rect.h <= 0) return undefined;
  const nx = (px - rect.x) / rect.w;
  const ny = (py - rect.y) / rect.h;
  if (nx < 0 || ny < 0 || nx >= 1 || ny >= 1) return undefined;
  return { x: Math.min(worldW - 1, Math.floor(nx * worldW)), y: Math.min(worldH - 1, Math.floor(ny * worldH)) };
};

const axisPieces = (start: number, size: number, world: number): Array<{ from: number; size: number }> => {
  if (size >= world) return [{ from: 0, size: world }];
  const r = start % world;
  const from = r < 0 ? r + world : r;
  const first = Math.min(size, world - from);
  const out = [{ from, size: first }];
  if (size > first) out.push({ from: 0, size: size - first });
  return out;
};

/**
 * The view centred on (camX, camY), viewW x viewH tiles, as up to four world-tile rectangles inside the world:
 * a view across the world's edge shows on both sides, as it does in the game.
 */
export const viewRectPieces = (
  camX: number,
  camY: number,
  viewW: number,
  viewH: number,
  worldW = WORLD_WIDTH,
  worldH = WORLD_HEIGHT
): Rect[] => {
  const xs = axisPieces(camX - viewW / 2, viewW, worldW);
  const ys = axisPieces(camY - viewH / 2, viewH, worldH);
  const out: Rect[] = [];
  for (const px of xs) for (const py of ys) out.push({ x: px.from, y: py.from, w: px.size, h: py.size });
  return out;
};
