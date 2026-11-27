// The scout plan's range ring on the 2D canvas (client-scout-drone-range.ts): one small dot on every tile
// where the next leg reaches its range limit, the flat counterpart of the true-3D ring of beads
// (client-map-3d-scout-drone-plan-overlay.ts). Drawn from drawRouteOverlays2D, only with true 3D off.
import type { ScoutPlanState } from "../client-scout-drone/client-scout-drone-plan.js";
import { scoutPlanRangeEdge } from "../client-scout-drone/client-scout-drone-range.js";

const RANGE_EDGE = "#7fd0e6";

export const drawScoutRange2D = (
  ctx: CanvasRenderingContext2D,
  state: ScoutPlanState,
  tileCenterOnScreen: (wx: number, wy: number) => { sx: number; sy: number },
  size: number,
  nowMs: number
): number => {
  if (!state.scoutDronePicking.active) return 0;
  const edge = scoutPlanRangeEdge(state, nowMs);
  if (edge.length === 0) return 0;
  const radius = Math.max(1.5, size * 0.12);
  const { width, height } = ctx.canvas;
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = RANGE_EDGE;
  ctx.beginPath();
  let drawn = 0;
  for (const tile of edge) {
    const { sx, sy } = tileCenterOnScreen(tile.x, tile.y);
    if (sx < -size || sy < -size || sx > width + size || sy > height + size) continue;
    ctx.moveTo(sx + radius, sy);
    ctx.arc(sx, sy, radius, 0, Math.PI * 2);
    drawn += 1;
  }
  ctx.fill();
  ctx.restore();
  return drawn;
};
