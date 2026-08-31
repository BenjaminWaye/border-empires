import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import type { DockPair } from "./client-types.js";

// 2D-only: draws the dashed sea-route line for the selected dock's pairing,
// via the flat-grid worldToScreen mapping. That mapping does not match the
// true-3D renderer's isometric/heightfield projection, so this must only run
// when the true-3D renderer is inactive — the caller is responsible for that
// gate (drawing it unguarded on the 2D overlay canvas that sits atop the 3D
// scene made the dashed line cut across land there instead of tracing the
// sea route). True-3D has no dock-connector-line overlay yet (only the
// endpoint markers via client-map-3d-dock-overlay.ts) -- tracked as a
// follow-up rather than drawn misaligned.
export const drawSelectedDockSeaRoute2D = (deps: {
  ctx: CanvasRenderingContext2D;
  canvas: { width: number; height: number };
  dockPairs: readonly DockPair[];
  selected: { x: number; y: number } | undefined;
  size: number;
  halfW: number;
  halfH: number;
  nowMs: number;
  isDockRouteVisibleForPlayer: (pair: DockPair) => boolean;
  resolveDockSeaRoute: (pair: DockPair) => Array<{ x: number; y: number }>;
  worldToScreen: (wx: number, wy: number, size: number, halfW: number, halfH: number) => { sx: number; sy: number };
}): void => {
  const routeDash = [9, 8];
  const wrapJumpX = (WORLD_WIDTH * deps.size) / 2;
  const wrapJumpY = (WORLD_HEIGHT * deps.size) / 2;
  for (const pair of deps.dockPairs) {
    if (!deps.isDockRouteVisibleForPlayer(pair)) continue;
    const selectedRoute = Boolean(
      deps.selected &&
        ((pair.ax === deps.selected.x && pair.ay === deps.selected.y) || (pair.bx === deps.selected.x && pair.by === deps.selected.y))
    );
    if (!selectedRoute) continue;

    // Resolves the server-computed, authoritative route (frozen with the world
    // at worldgen time); falls back to client A* only for older servers that
    // omit it. No straight-line fallback: draw nothing rather than a cross-island line.
    const route = deps.resolveDockSeaRoute(pair);
    if (route.length < 2) continue;
    deps.ctx.setLineDash(routeDash);
    deps.ctx.lineDashOffset = -((deps.nowMs / 140) % 17);
    deps.ctx.strokeStyle = "rgba(255, 246, 176, 0.9)";
    deps.ctx.lineWidth = 2;
    let prevScreen = deps.worldToScreen(route[0]!.x, route[0]!.y, deps.size, deps.halfW, deps.halfH);
    for (let i = 1; i < route.length; i += 1) {
      const b = route[i]!;
      const sb = deps.worldToScreen(b.x, b.y, deps.size, deps.halfW, deps.halfH);
      const segmentWraps = Math.abs(sb.sx - prevScreen.sx) > wrapJumpX || Math.abs(sb.sy - prevScreen.sy) > wrapJumpY;
      const offscreen =
        (prevScreen.sx < -deps.size && sb.sx < -deps.size) ||
        (prevScreen.sy < -deps.size && sb.sy < -deps.size) ||
        (prevScreen.sx > deps.canvas.width + deps.size && sb.sx > deps.canvas.width + deps.size) ||
        (prevScreen.sy > deps.canvas.height + deps.size && sb.sy > deps.canvas.height + deps.size);
      if (segmentWraps || offscreen) {
        prevScreen = sb;
        continue;
      }
      deps.ctx.beginPath();
      deps.ctx.moveTo(prevScreen.sx, prevScreen.sy);
      deps.ctx.lineTo(sb.sx, sb.sy);
      deps.ctx.stroke();
      prevScreen = sb;
    }
    deps.ctx.setLineDash([]);
    deps.ctx.lineDashOffset = 0;
  }
  deps.ctx.setLineDash([]);
  deps.ctx.lineDashOffset = 0;
};
