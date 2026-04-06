import { terrainAt } from "@border-empires/shared";
import { buildRoadNetwork } from "./client-road-network.js";
import type { ClientState } from "./client-state.js";
import { drawRuntimeOverlayTile, drawRuntimeRoadPass, drawRuntimeSelectionOverlays } from "./client-runtime-tile-render.js";
import { drawRuntimeDockRoutes, drawRuntimeLateSceneEffects } from "./client-runtime-scene.js";
import type { RuntimeLoopState, StartClientRuntimeLoopDeps, VisibleRenderTile } from "./client-runtime-types.js";

export const drawClientRuntimeFrame = (state: ClientState, deps: StartClientRuntimeLoopDeps, runtimeState: RuntimeLoopState): void => {
  const nowMs = performance.now();
  const minFrameGap = deps.isMobile() ? 40 : 24;
  if (nowMs - runtimeState.lastDrawAt < minFrameGap) {
    requestAnimationFrame(() => drawClientRuntimeFrame(state, deps, runtimeState));
    return;
  }
  runtimeState.lastDrawAt = nowMs;
  deps.ctx.fillStyle = "#0b1320";
  deps.ctx.fillRect(0, 0, deps.canvas.width, deps.canvas.height);
  const size = state.zoom;
  const halfW = Math.floor(deps.canvas.width / size / 2);
  const halfH = Math.floor(deps.canvas.height / size / 2);
  if (size >= 14 && (runtimeState.roadNetworkBuiltAt === 0 || nowMs - runtimeState.roadNetworkBuiltAt > 450)) {
    runtimeState.roadNetwork = buildRoadNetwork({ tiles: state.tiles, keyFor: deps.keyFor, wrapX: deps.wrapX, wrapY: deps.wrapY });
    runtimeState.roadNetworkBuiltAt = nowMs;
  }
  const dockEndpointKeys = new Set<string>();
  for (const pair of state.dockPairs) {
    dockEndpointKeys.add(deps.keyFor(pair.ax, pair.ay));
    dockEndpointKeys.add(deps.keyFor(pair.bx, pair.by));
  }
  const crystalTargetingActive = state.crystalTargeting.active;
  const crystalTone = crystalTargetingActive ? deps.crystalTargetingTone(state.crystalTargeting.ability) : "amber";
  const queueIndex = new Map<string, number>();
  const queuedBuildIndex = new Map<string, number>();
  const settleQueueIndex = new Map<string, number>();
  const startingArrowTargets = new Map(deps.startingExpansionArrowTargets().map((target) => [deps.keyFor(target.x, target.y), target] as const));
  let queueOffset = 0;
  if (state.actionInFlight && state.actionTargetKey) {
    queueIndex.set(state.actionTargetKey, 1);
    queueOffset = 1;
  }
  for (let i = 0; i < state.actionQueue.length; i += 1) {
    const q = state.actionQueue[i];
    if (q) queueIndex.set(deps.keyFor(q.x, q.y), i + 1 + queueOffset);
  }
  for (let i = 0; i < state.developmentQueue.length; i += 1) {
    const entry = state.developmentQueue[i];
    if (!entry) continue;
    if (entry.kind === "SETTLE") settleQueueIndex.set(entry.tileKey, i + 1);
    if (entry.kind === "BUILD") queuedBuildIndex.set(entry.tileKey, i + 1);
  }
  const overlayTiles: VisibleRenderTile[] = [];
  for (let y = -halfH; y <= halfH; y += 1) {
    for (let x = -halfW; x <= halfW; x += 1) {
      const wx = deps.wrapX(state.camX + x);
      const wy = deps.wrapY(state.camY + y);
      const wk = deps.keyFor(wx, wy);
      const t = state.tiles.get(wk);
      const settlementProgress = t ? deps.settlementProgressForTile(wx, wy) : undefined;
      const vis = deps.tileVisibilityStateAt(wx, wy, t);
      const px = (x + halfW) * size;
      const py = (y + halfH) * size;
      if (vis === "unexplored") {
        deps.ctx.fillStyle = "#06090f";
        deps.ctx.fillRect(px, py, size - 1, size - 1);
      } else if (!t) {
        if (state.firstChunkAt === 0 || state.fogDisabled) deps.drawTerrainTile(wx, wy, terrainAt(wx, wy), px, py, size);
        else {
          deps.ctx.fillStyle = "#06090f";
          deps.ctx.fillRect(px, py, size - 1, size - 1);
        }
      } else if (vis === "fogged") {
        deps.drawTerrainTile(wx, wy, t.terrain, px, py, size);
        deps.ctx.fillStyle = "rgba(2, 5, 10, 0.72)";
        deps.ctx.fillRect(px, py, size - 1, size - 1);
      } else if (t.terrain === "SEA" || t.terrain === "MOUNTAIN") deps.drawTerrainTile(wx, wy, t.terrain, px, py, size);
      else deps.drawTerrainTile(wx, wy, "LAND", px, py, size);
      if (t && vis === "visible" && t.terrain === "LAND") deps.drawForestOverlay(wx, wy, px, py, size);
      if (t && vis === "visible" && t.terrain === "LAND" && t.ownerId) {
        deps.ctx.fillStyle = deps.effectiveOverlayColor(t.ownerId);
        let ownerAlpha = t.ownershipState === "FRONTIER" ? 0.2 : 0.92;
        if (typeof t.breachShockUntil === "number" && t.breachShockUntil > Date.now()) ownerAlpha = Math.min(ownerAlpha, 0.62);
        deps.ctx.globalAlpha = ownerAlpha;
        if (t.ownershipState === "SETTLED") deps.ctx.fillRect(px, py, size, size);
        else deps.ctx.fillRect(px, py, size - 1, size - 1);
        deps.ctx.globalAlpha = 1;
      }
      overlayTiles.push({ wx, wy, wk, px, py, vis, t, settlementProgress });
    }
  }
  drawRuntimeRoadPass(state, deps, overlayTiles, runtimeState.roadNetwork);
  for (const overlayTile of overlayTiles) {
    drawRuntimeOverlayTile(state, deps, overlayTile, {
      nowMs,
      size,
      halfW,
      halfH,
      roadNetwork: runtimeState.roadNetwork,
      roadNetworkBuiltAt: runtimeState.roadNetworkBuiltAt,
      dockEndpointKeys,
      queueIndex,
      queuedBuildIndex,
      settleQueueIndex,
      startingArrowTargets,
      crystalTargetingActive,
      crystalTone
    });
  }
  drawRuntimeSelectionOverlays(state, deps, nowMs, size, halfW, halfH);
  drawRuntimeDockRoutes(state, deps, nowMs, size, halfW, halfH);
  drawRuntimeLateSceneEffects(state, deps, nowMs, size, halfW, halfH);
  requestAnimationFrame(() => drawClientRuntimeFrame(state, deps, runtimeState));
};
