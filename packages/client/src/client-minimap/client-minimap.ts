import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { drawAetherBridgeLane, hexWithAlpha } from "../client-map-render/client-map-render.js";
import { resourceIconForKey } from "../client-map-display.js";
import { computeMiniMapViewBox } from "../client-minimap-view-box.js";
import { townIdentityForTile, tileHasTownIdentity } from "../client-town-identity.js";
import { shardRainPingActiveAt, visibleShardSiteForTile, type ClientShardRainPing } from "../client-shard-rain-pings/client-shard-rain-pings.js";
import { effectiveFogDisabled } from "../client-map-reveal/client-map-reveal.js";
import type { DockPair, StrategicReplayEvent, Tile } from "../client-types.js";

type ReplayTileView = { ownerId?: string; ownershipState?: Tile["ownershipState"] };

export type MiniMapContentCache = {
  computedAt: number;
  box?: { x0: number; y0: number; w: number; h: number };
};

export const miniMapTownMarkerPalette = (
  tile: Tile,
  hasCollectableYield: boolean
): { outer: string; inner: string; radius: number } => {
  const outer = "rgba(6, 10, 18, 0.86)";
  const radius = hasCollectableYield ? 3.6 : 3.2;
  let inner = "rgba(196, 169, 255, 0.94)";
  const town = townIdentityForTile(tile);
  if (hasCollectableYield) inner = "rgba(255, 220, 118, 0.96)";
  else if (town?.type === "MARKET") inner = "rgba(255, 214, 112, 0.94)";
  else if (town?.type === "FARMING") inner = "rgba(157, 236, 130, 0.94)";
  return { outer, inner, radius };
};

// Content-layer recompute floor, in ms. Matches the previous single throttle: tile/replay
// churn waits for this window, but it no longer gates camera/zoom responsiveness (see below).
const CONTENT_RECOMPUTE_FLOOR_MS = 140;

export type MiniMapEdgeArrow = { x: number; y: number; angle: number };

// Clamps a pixel point that falls outside the [0,w]x[0,h] minimap canvas onto
// its border, along the ray from the canvas center through that point,
// inset by `margin` px — used to draw a direction indicator for things (like
// a distant shard rain site) that fell outside the minimap's current view
// box rather than just omitting them.
export const miniMapEdgeArrowPoint = (targetX: number, targetY: number, w: number, h: number, margin = 8): MiniMapEdgeArrow => {
  const cx = w / 2;
  const cy = h / 2;
  const dx = targetX - cx;
  const dy = targetY - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy, angle: 0 };
  const halfW = Math.max(1, w / 2 - margin);
  const halfH = Math.max(1, h / 2 - margin);
  const scaleX = dx !== 0 ? halfW / Math.abs(dx) : Infinity;
  const scaleY = dy !== 0 ? halfH / Math.abs(dy) : Infinity;
  const scale = Math.min(scaleX, scaleY);
  return { x: cx + dx * scale, y: cy + dy * scale, angle: Math.atan2(dy, dx) };
};

export const drawMiniMap = (options: {
  nowMs: number;
  state: {
    camX: number;
    camY: number;
    zoom: number;
    replayActive: boolean;
    replayIndex: number;
    replayOwnershipByTile: Map<string, ReplayTileView>;
    fogDisabled: boolean;
    tiles: Map<string, Tile>;
    dockPairs: DockPair[];
    shardRainPingsByTile: Map<string, ClientShardRainPing>;
  };
  canvas: HTMLCanvasElement;
  miniMapEl: HTMLCanvasElement;
  miniMapCtx: CanvasRenderingContext2D;
  // Offscreen layer holding everything that doesn't depend on the camera/zoom (owner tints,
  // fog, docks, town/shard/watchtower markers). Recomputing this is the expensive part (several
  // full tile-map scans plus a per-pixel fog pass); it's cached here and only redrawn per
  // contentCache's own throttle, never on every camera/zoom-changed frame.
  miniMapContentEl: HTMLCanvasElement;
  miniMapContentCtx: CanvasRenderingContext2D;
  miniMapBase: HTMLCanvasElement;
  miniMapBaseReady: boolean;
  miniMapLast: { camX: number; camY: number; zoom: number; replayIndex: number; tileCount: number };
  // Mutable cache the caller persists across calls; this function reads and writes it directly.
  contentCache: MiniMapContentCache;
  parseKey: (key: string) => { x: number; y: number };
  keyFor: (x: number, y: number) => string;
  tileVisibilityStateAt: (x: number, y: number, tile?: Tile) => "visible" | "fogged" | "unexplored";
  effectiveOverlayColor: (ownerId: string) => string;
  isDockRouteVisibleForPlayer: (pair: DockPair) => boolean;
  hasCollectableYield: (tile: Tile | undefined) => boolean;
  replayCurrentEvent: () => StrategicReplayEvent | undefined;
}): boolean => {
  // Camera/zoom moves need an immediate redraw of the viewport indicator for input
  // responsiveness, but they must NOT force a recompute of the expensive content layer below —
  // that stays gated by contentDirty + the throttle floor regardless of how often the camera
  // moves (e.g. a rapid zoom gesture fires many camera-moved frames per second).
  const cameraMoved =
    options.state.camX !== options.miniMapLast.camX ||
    options.state.camY !== options.miniMapLast.camY ||
    options.state.zoom !== options.miniMapLast.zoom;
  const contentDirty =
    options.state.tiles.size !== options.miniMapLast.tileCount ||
    (options.state.replayActive && options.state.replayIndex !== options.miniMapLast.replayIndex);
  if (!cameraMoved && !contentDirty && options.contentCache.computedAt !== 0) return false;

  const w = options.miniMapEl.width;
  const h = options.miniMapEl.height;
  if (!options.miniMapBaseReady) {
    options.miniMapCtx.clearRect(0, 0, w, h);
    options.miniMapCtx.fillStyle = "#0b1320";
    options.miniMapCtx.fillRect(0, 0, w, h);
    options.miniMapCtx.strokeStyle = "rgba(255,255,255,0.25)";
    options.miniMapCtx.strokeRect(0.5, 0.5, w - 1, h - 1);
    return true;
  }

  if (options.miniMapContentEl.width !== w || options.miniMapContentEl.height !== h) {
    options.miniMapContentEl.width = w;
    options.miniMapContentEl.height = h;
    options.contentCache.computedAt = 0;
  }

  const shouldRecomputeContent =
    options.contentCache.computedAt === 0 || (contentDirty && options.nowMs - options.contentCache.computedAt >= CONTENT_RECOMPUTE_FLOOR_MS);

  if (shouldRecomputeContent) {
    const cctx = options.miniMapContentCtx;
    cctx.clearRect(0, 0, w, h);

    const box = computeMiniMapViewBox({
      tiles: options.state.tiles,
      fogDisabled: effectiveFogDisabled(options.state),
      canvasW: w,
      canvasH: h
    });
    const wxToPx = (wx: number): number => ((wx - box.x0) / box.w) * w;
    const wyToPy = (wy: number): number => ((wy - box.y0) / box.h) * h;
    const inBox = (x: number, y: number): boolean =>
      x >= box.x0 && y >= box.y0 && x < box.x0 + box.w && y < box.y0 + box.h;

    const baseW = options.miniMapBase.width;
    const baseH = options.miniMapBase.height;
    const prevSmoothing = cctx.imageSmoothingEnabled;
    cctx.imageSmoothingEnabled = false;
    cctx.drawImage(
      options.miniMapBase,
      (box.x0 / WORLD_WIDTH) * baseW,
      (box.y0 / WORLD_HEIGHT) * baseH,
      (box.w / WORLD_WIDTH) * baseW,
      (box.h / WORLD_HEIGHT) * baseH,
      0,
      0,
      w,
      h
    );
    cctx.imageSmoothingEnabled = prevSmoothing;
    if (options.state.replayActive) {
      for (const [tileKey, replayTile] of options.state.replayOwnershipByTile) {
        if (!replayTile.ownerId) continue;
        const { x, y } = options.parseKey(tileKey);
        if (x < box.x0 || y < box.y0 || x >= box.x0 + box.w || y >= box.y0 + box.h) continue;
        const px = Math.floor(wxToPx(x));
        const py = Math.floor(wyToPy(y));
        cctx.fillStyle = hexWithAlpha(options.effectiveOverlayColor(replayTile.ownerId), replayTile.ownershipState === "SETTLED" ? 0.9 : 0.6);
        cctx.fillRect(px, py, 1, 1);
      }
    } else {
      for (const tile of options.state.tiles.values()) {
        if (!tile.ownerId) continue;
        if (!effectiveFogDisabled(options.state) && tile.fogged) continue;
        if (!inBox(tile.x, tile.y)) continue;
        const ox = Math.floor(wxToPx(tile.x));
        const oy = Math.floor(wyToPy(tile.y));
        cctx.fillStyle = hexWithAlpha(options.effectiveOverlayColor(tile.ownerId), tile.ownershipState === "SETTLED" ? 0.9 : 0.6);
        cctx.fillRect(ox, oy, 1, 1);
      }
    }

    if (!effectiveFogDisabled(options.state)) {
      const fogStyle: Record<"unexplored" | "fogged", string> = {
        unexplored: "#000000",
        fogged: "rgba(0,0,0,0.62)"
      };
      for (let py = 0; py < h; py += 1) {
        const wy = Math.floor(box.y0 + (py / h) * box.h);
        let runVis: "unexplored" | "fogged" | undefined;
        let runStartPx = 0;
        const flushRun = (endPx: number): void => {
          if (runVis === undefined) return;
          cctx.fillStyle = fogStyle[runVis];
          cctx.fillRect(runStartPx, py, endPx - runStartPx, 1);
        };
        for (let px = 0; px < w; px += 1) {
          const wx = Math.floor(box.x0 + (px / w) * box.w);
          const tile = options.state.tiles.get(options.keyFor(wx, wy));
          const vis = options.tileVisibilityStateAt(wx, wy, tile);
          const cellVis = vis === "visible" ? undefined : vis;
          if (cellVis !== runVis) {
            flushRun(px);
            runVis = cellVis;
            runStartPx = px;
          }
        }
        flushRun(w);
      }
    }

    cctx.fillStyle = "rgba(127, 238, 255, 0.9)";
    for (const pair of options.state.dockPairs) {
      if (!options.isDockRouteVisibleForPlayer(pair)) continue;
      const aKnown = options.state.tiles.get(options.keyFor(pair.ax, pair.ay));
      const bKnown = options.state.tiles.get(options.keyFor(pair.bx, pair.by));
      if (!effectiveFogDisabled(options.state) && ((!aKnown || aKnown.fogged) && (!bKnown || bKnown.fogged))) continue;
      if (inBox(pair.ax, pair.ay)) {
        const adx = Math.floor(wxToPx(pair.ax));
        const ady = Math.floor(wyToPy(pair.ay));
        cctx.fillRect(adx - 1, ady - 1, 3, 3);
      }
      if (inBox(pair.bx, pair.by)) {
        const bdx = Math.floor(wxToPx(pair.bx));
        const bdy = Math.floor(wyToPy(pair.by));
        cctx.fillRect(bdx - 1, bdy - 1, 3, 3);
      }
    }

    for (const tile of options.state.tiles.values()) {
      if (!tileHasTownIdentity(tile)) continue;
      if (!effectiveFogDisabled(options.state) && tile.fogged) continue;
      if (!inBox(tile.x, tile.y)) continue;
      const tx = Math.floor(wxToPx(tile.x));
      const ty = Math.floor(wyToPy(tile.y));
      const palette = miniMapTownMarkerPalette(tile, options.hasCollectableYield(tile));
      cctx.fillStyle = palette.outer;
      cctx.beginPath();
      cctx.arc(tx, ty, palette.radius, 0, Math.PI * 2);
      cctx.fill();
      cctx.fillStyle = palette.inner;
      cctx.beginPath();
      cctx.arc(tx, ty, options.hasCollectableYield(tile) ? 2.1 : 1.8, 0, Math.PI * 2);
      cctx.fill();
    }

    if (options.state.replayActive) {
      const replayEvent = options.replayCurrentEvent();
      if (replayEvent && replayEvent.x !== undefined && replayEvent.y !== undefined && inBox(replayEvent.x, replayEvent.y)) {
        const ex = Math.floor(wxToPx(replayEvent.x));
        const ey = Math.floor(wyToPy(replayEvent.y));
        cctx.strokeStyle = "rgba(255, 244, 171, 0.98)";
        cctx.lineWidth = 1.6;
        cctx.strokeRect(ex - 2, ey - 2, 5, 5);
      }
      if (replayEvent?.from && replayEvent?.to) {
        drawAetherBridgeLane(cctx, wxToPx(replayEvent.from.x), wyToPy(replayEvent.from.y), wxToPx(replayEvent.to.x), wyToPy(replayEvent.to.y), options.nowMs, {
          compact: true
        });
      }
    }

    cctx.save();
    cctx.textAlign = "center";
    cctx.textBaseline = "middle";
    cctx.font = "8px monospace";
    for (const tile of options.state.tiles.values()) {
      const shardSite = visibleShardSiteForTile(tile, options.state.shardRainPingsByTile, options.nowMs);
      if (!shardSite) continue;
      if (!inBox(tile.x, tile.y)) continue;
      const tx = Math.floor(wxToPx(tile.x));
      const ty = Math.floor(wyToPy(tile.y));
      cctx.fillStyle = shardSite.kind === "FALL" ? "rgba(255, 244, 176, 0.98)" : "rgba(147, 235, 255, 0.96)";
      cctx.fillText(resourceIconForKey("SHARD"), tx, ty);
    }
    const pingPhase = 0.5 + 0.5 * Math.sin(options.nowMs / 240);
    cctx.lineWidth = 1.2;
    for (const [, ping] of options.state.shardRainPingsByTile) {
      if (!shardRainPingActiveAt(ping, options.nowMs)) continue;
      const tx = wxToPx(ping.x);
      const ty = wyToPy(ping.y);
      if (inBox(ping.x, ping.y)) {
        cctx.strokeStyle = `rgba(255, 236, 170, ${0.55 + pingPhase * 0.25})`;
        cctx.beginPath();
        cctx.arc(Math.floor(tx), Math.floor(ty), 3.4 + pingPhase * 2.1, 0, Math.PI * 2);
        cctx.stroke();
        continue;
      }
      // Off the current minimap view box (typical for a shard rain far from
      // explored territory) — point at it from the edge instead of dropping it.
      const arrow = miniMapEdgeArrowPoint(tx, ty, w, h);
      cctx.save();
      cctx.translate(arrow.x, arrow.y);
      cctx.rotate(arrow.angle);
      cctx.fillStyle = `rgba(255, 236, 170, ${0.75 + pingPhase * 0.25})`;
      cctx.beginPath();
      cctx.moveTo(5, 0);
      cctx.lineTo(-3.5, -3.2);
      cctx.lineTo(-3.5, 3.2);
      cctx.closePath();
      cctx.fill();
      cctx.restore();
    }

    // Watchtowers: a dim marker while dormant, and — for ~10s right after a
    // player expands onto one — a bright expanding pulse ring over the
    // revealed 10x10-ish area (matches the 3D flicker; see
    // client-map-3d-watchtower-overlay.ts).
    for (const tile of options.state.tiles.values()) {
      if (!tile.watchtower) continue;
      if (!effectiveFogDisabled(options.state) && tile.fogged && !tile.watchtower.activated) continue;
      if (!inBox(tile.x, tile.y)) continue;
      const tx = Math.floor(wxToPx(tile.x));
      const ty = Math.floor(wyToPy(tile.y));
      const revealing = typeof tile.watchtower.revealUntil === "number" && tile.watchtower.revealUntil > options.nowMs;
      // Brass/amber palette to match the steampunk 3D lantern beacon.
      cctx.fillStyle = tile.watchtower.activated ? "rgba(255, 190, 110, 0.95)" : "rgba(150, 120, 80, 0.75)";
      cctx.beginPath();
      cctx.arc(tx, ty, 2, 0, Math.PI * 2);
      cctx.fill();
      if (revealing) {
        cctx.strokeStyle = `rgba(255, 179, 71, ${0.5 + pingPhase * 0.35})`;
        cctx.lineWidth = 1.4;
        cctx.beginPath();
        cctx.arc(tx, ty, 5 + pingPhase * 3, 0, Math.PI * 2);
        cctx.stroke();
      }
    }
    cctx.restore();

    options.contentCache.box = box;
    options.contentCache.computedAt = options.nowMs;
  }

  const box = options.contentCache.box ?? { x0: 0, y0: 0, w: WORLD_WIDTH, h: WORLD_HEIGHT };
  const wxToPx = (wx: number): number => ((wx - box.x0) / box.w) * w;
  const wyToPy = (wy: number): number => ((wy - box.y0) / box.h) * h;

  const prevSmoothing = options.miniMapCtx.imageSmoothingEnabled;
  options.miniMapCtx.imageSmoothingEnabled = false;
  options.miniMapCtx.clearRect(0, 0, w, h);
  options.miniMapCtx.drawImage(options.miniMapContentEl, 0, 0);
  options.miniMapCtx.imageSmoothingEnabled = prevSmoothing;

  // Viewport rectangle + camera dot: the only part that actually depends on camX/camY/zoom,
  // so this is the only work redone on every camera/zoom-changed frame.
  const viewTilesW = options.canvas.width / options.state.zoom;
  const viewTilesH = options.canvas.height / options.state.zoom;
  const camLeft = options.state.camX - viewTilesW / 2;
  const camTop = options.state.camY - viewTilesH / 2;
  options.miniMapCtx.strokeStyle = "rgba(255, 240, 180, 0.95)";
  options.miniMapCtx.lineWidth = 1.5;
  options.miniMapCtx.strokeRect(
    wxToPx(camLeft),
    wyToPy(camTop),
    Math.max(2, (viewTilesW / box.w) * w),
    Math.max(2, (viewTilesH / box.h) * h)
  );

  const px = wxToPx(options.state.camX);
  const py = wyToPy(options.state.camY);
  options.miniMapCtx.fillStyle = "#ffd166";
  options.miniMapCtx.beginPath();
  options.miniMapCtx.arc(px, py, 2.8, 0, Math.PI * 2);
  options.miniMapCtx.fill();

  return true;
};
