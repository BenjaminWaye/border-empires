import { WORLD_HEIGHT, WORLD_WIDTH, terrainAt } from "@border-empires/shared";
import type { ClientState } from "./client-state.js";
import type { StartClientRuntimeLoopDeps, VisibleRenderTile } from "./client-runtime-types.js";

export const drawRuntimeDockRoutes = (
  state: ClientState,
  deps: StartClientRuntimeLoopDeps,
  nowMs: number,
  size: number,
  halfW: number,
  halfH: number
): void => {
  const routeDash = [9, 8];
  for (const pair of state.dockPairs) {
    if (!deps.isDockRouteVisibleForPlayer(pair)) continue;
    const aIsDockLand = terrainAt(pair.ax, pair.ay) === "LAND";
    const bIsDockLand = terrainAt(pair.bx, pair.by) === "LAND";
    const selectedRoute = Boolean(state.selected && ((pair.ax === state.selected.x && pair.ay === state.selected.y) || (pair.bx === state.selected.x && pair.by === state.selected.y)));
    if (!selectedRoute || !aIsDockLand || !bIsDockLand) continue;
    const route = deps.computeDockSeaRoute(pair.ax, pair.ay, pair.bx, pair.by);
    deps.ctx.setLineDash(routeDash);
    deps.ctx.lineDashOffset = -((nowMs / 140) % 17);
    if (route.length < 2) {
      const a = deps.worldToScreen(pair.ax, pair.ay, size, halfW, halfH);
      const b = { sx: a.sx + deps.toroidDelta(pair.ax, pair.bx, WORLD_WIDTH) * size, sy: a.sy + deps.toroidDelta(pair.ay, pair.by, WORLD_HEIGHT) * size };
      deps.ctx.strokeStyle = selectedRoute ? "rgba(255, 246, 176, 0.9)" : "rgba(255, 233, 149, 0.45)";
      deps.ctx.lineWidth = selectedRoute ? 2 : 1.2;
      deps.ctx.beginPath();
      deps.ctx.moveTo(a.sx, a.sy);
      deps.ctx.lineTo(b.sx, b.sy);
      deps.ctx.stroke();
      deps.ctx.setLineDash([]);
      deps.ctx.lineDashOffset = 0;
      continue;
    }
    deps.ctx.strokeStyle = selectedRoute ? "rgba(255, 246, 176, 0.9)" : "rgba(255, 233, 149, 0.45)";
    deps.ctx.lineWidth = selectedRoute ? 2 : 1.2;
    let prev = route[0]!;
    let prevScreen = deps.worldToScreen(prev.x, prev.y, size, halfW, halfH);
    for (let i = 1; i < route.length; i += 1) {
      const b = route[i]!;
      const stepX = deps.toroidDelta(prev.x, b.x, WORLD_WIDTH) * size;
      const stepY = deps.toroidDelta(prev.y, b.y, WORLD_HEIGHT) * size;
      const sb = { sx: prevScreen.sx + stepX, sy: prevScreen.sy + stepY };
      if (!((prevScreen.sx < -size && sb.sx < -size) || (prevScreen.sy < -size && sb.sy < -size) || (prevScreen.sx > deps.canvas.width + size && sb.sx > deps.canvas.width + size) || (prevScreen.sy > deps.canvas.height + size && sb.sy > deps.canvas.height + size))) {
        deps.ctx.beginPath();
        deps.ctx.moveTo(prevScreen.sx, prevScreen.sy);
        deps.ctx.lineTo(sb.sx, sb.sy);
        deps.ctx.stroke();
      }
      prev = b;
      prevScreen = sb;
    }
    deps.ctx.setLineDash([]);
    deps.ctx.lineDashOffset = 0;
  }
  deps.ctx.setLineDash([]);
  deps.ctx.lineDashOffset = 0;
};

export const drawRuntimeLateSceneEffects = (
  state: ClientState,
  deps: StartClientRuntimeLoopDeps,
  nowMs: number,
  size: number,
  halfW: number,
  halfH: number
): void => {
  const visibleAetherBridges = state.activeAetherBridges.filter((bridge) => bridge.endsAt > nowMs);
  for (const bridge of visibleAetherBridges) {
    const from = deps.worldToScreen(bridge.from.x, bridge.from.y, size, halfW, halfH);
    const dx = deps.toroidDelta(bridge.from.x, bridge.to.x, WORLD_WIDTH) * size;
    const dy = deps.toroidDelta(bridge.from.y, bridge.to.y, WORLD_HEIGHT) * size;
    deps.drawAetherBridgeLane(deps.ctx, from.sx, from.sy, from.sx + dx, from.sy + dy, nowMs);
  }
  if (state.shardRainFxUntil > nowMs) {
    const fxProgress = Math.max(0, (state.shardRainFxUntil - nowMs) / 8_000);
    deps.ctx.save();
    deps.ctx.globalCompositeOperation = "screen";
    for (let i = 0; i < 18; i += 1) {
      const x = ((i * 97 + nowMs * 0.08) % deps.canvas.width);
      const y = ((i * 59 + nowMs * 0.21) % deps.canvas.height);
      const len = 24 + (i % 5) * 10;
      const alpha = (0.08 + (i % 3) * 0.03) * fxProgress;
      deps.ctx.strokeStyle = `rgba(102, 224, 255, ${alpha})`;
      deps.ctx.lineWidth = 1 + (i % 2);
      deps.ctx.beginPath();
      deps.ctx.moveTo(x, y);
      deps.ctx.lineTo(x - 8, y + len);
      deps.ctx.stroke();
    }
    deps.ctx.restore();
  }
  deps.drawMiniMap();
  deps.maybeRefreshForCamera(false);
};
