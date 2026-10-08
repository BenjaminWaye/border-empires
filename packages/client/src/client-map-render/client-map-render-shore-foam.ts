// 2D canvas half of the coastline polish (3D: client-map-3d-shore.ts): a sea
// tile draws a soft light band along each of its edges that borders land,
// plus a small rounded patch where land only touches a corner, so the coast
// reads as a waterline rather than a hard square seam.
import { terrainAt } from "@border-empires/shared";

// Same light shallow-water tone as the 3D foam (FOAM_COLOR 0.6/0.86/0.85).
const FOAM_RGB = "153, 219, 217";
// Inner to outer bands (fraction of the tile, alpha) -- a cheap stepped gradient.
const FOAM_BANDS: ReadonlyArray<readonly [number, number]> = [[0.08, 0.5], [0.17, 0.28], [0.28, 0.12]];
const MIN_TILE_PX = 10;

const isLandTerrain = (t: string): boolean => t !== "SEA" && t !== "COASTAL_SEA";

/** Draws the shore foam on sea tile (wx, wy)'s top face (px, py, w x h). */
export const drawShoreFoam2D = (
  ctx: CanvasRenderingContext2D,
  wx: number,
  wy: number,
  px: number,
  py: number,
  w: number,
  h: number,
  isLandAt: (x: number, y: number) => boolean = (x, y) => isLandTerrain(terrainAt(x, y))
): void => {
  if (w < MIN_TILE_PX) return;
  const n = isLandAt(wx, wy - 1);
  const s = isLandAt(wx, wy + 1);
  const west = isLandAt(wx - 1, wy);
  const e = isLandAt(wx + 1, wy);
  const corners = [
    [!n && !west && isLandAt(wx - 1, wy - 1), px, py],
    [!n && !e && isLandAt(wx + 1, wy - 1), px + w, py],
    [!s && !west && isLandAt(wx - 1, wy + 1), px, py + h],
    [!s && !e && isLandAt(wx + 1, wy + 1), px + w, py + h]
  ] as const;
  if (!n && !s && !west && !e && !corners.some(([on]) => on)) return;
  for (const [depth, alpha] of FOAM_BANDS) {
    ctx.fillStyle = `rgba(${FOAM_RGB}, ${alpha})`;
    const dx = Math.max(1, Math.round(w * depth));
    const dy = Math.max(1, Math.round(h * depth));
    if (n) ctx.fillRect(px, py, w, dy);
    if (s) ctx.fillRect(px, py + h - dy, w, dy);
    if (west) ctx.fillRect(px, py, dx, h);
    if (e) ctx.fillRect(px + w - dx, py, dx, h);
    for (const [on, cx, cy] of corners) {
      if (!on) continue;
      ctx.beginPath();
      ctx.arc(cx, cy, dx, 0, Math.PI * 2);
      ctx.fill();
    }
  }
};
