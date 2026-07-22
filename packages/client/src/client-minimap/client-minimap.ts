import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { drawAetherBridgeLane, hexWithAlpha } from "../client-map-render/client-map-render.js";
import { resourceIconForKey } from "../client-map-display.js";
import { computeMiniMapViewBox } from "../client-minimap-view-box.js";
import { townIdentityForTile, tileHasTownIdentity } from "../client-town-identity.js";
import { shardRainPingActiveAt, visibleShardSiteForTile, type ClientShardRainPing } from "../client-shard-rain-pings/client-shard-rain-pings.js";
import { effectiveFogDisabled } from "../client-map-reveal/client-map-reveal.js";
import type { DockPair, StrategicReplayEvent, Tile } from "../client-types.js";

type ReplayTileView = { ownerId?: string; ownershipState?: Tile["ownershipState"] };

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
  miniMapBase: HTMLCanvasElement;
  miniMapBaseReady: boolean;
  miniMapLast: { camX: number; camY: number; zoom: number; replayIndex: number; tileCount: number; drawAt: number };
  parseKey: (key: string) => { x: number; y: number };
  keyFor: (x: number, y: number) => string;
  tileVisibilityStateAt: (x: number, y: number, tile?: Tile) => "visible" | "fogged" | "unexplored";
  effectiveOverlayColor: (ownerId: string) => string;
  isDockRouteVisibleForPlayer: (pair: DockPair) => boolean;
  hasCollectableYield: (tile: Tile | undefined) => boolean;
  replayCurrentEvent: () => StrategicReplayEvent | undefined;
}): boolean => {
  const miniMapChanged =
    options.state.camX !== options.miniMapLast.camX ||
    options.state.camY !== options.miniMapLast.camY ||
    options.state.zoom !== options.miniMapLast.zoom ||
    options.state.tiles.size !== options.miniMapLast.tileCount ||
    (options.state.replayActive && options.state.replayIndex !== options.miniMapLast.replayIndex);
  if (!miniMapChanged && options.nowMs - options.miniMapLast.drawAt < 140) return false;

  const w = options.miniMapEl.width;
  const h = options.miniMapEl.height;
  options.miniMapCtx.clearRect(0, 0, w, h);
  if (!options.miniMapBaseReady) {
    options.miniMapCtx.fillStyle = "#0b1320";
    options.miniMapCtx.fillRect(0, 0, w, h);
    options.miniMapCtx.strokeStyle = "rgba(255,255,255,0.25)";
    options.miniMapCtx.strokeRect(0.5, 0.5, w - 1, h - 1);
    return true;
  }

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
  const prevSmoothing = options.miniMapCtx.imageSmoothingEnabled;
  options.miniMapCtx.imageSmoothingEnabled = false;
  options.miniMapCtx.drawImage(
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
  options.miniMapCtx.imageSmoothingEnabled = prevSmoothing;
  if (options.state.replayActive) {
    for (const [tileKey, replayTile] of options.state.replayOwnershipByTile) {
      if (!replayTile.ownerId) continue;
      const { x, y } = options.parseKey(tileKey);
      if (x < box.x0 || y < box.y0 || x >= box.x0 + box.w || y >= box.y0 + box.h) continue;
      const px = Math.floor(wxToPx(x));
      const py = Math.floor(wyToPy(y));
      options.miniMapCtx.fillStyle = hexWithAlpha(
        options.effectiveOverlayColor(replayTile.ownerId),
        replayTile.ownershipState === "SETTLED" ? 0.9 : 0.6
      );
      options.miniMapCtx.fillRect(px, py, 1, 1);
    }
  } else {
    for (const tile of options.state.tiles.values()) {
      if (!tile.ownerId) continue;
      if (!effectiveFogDisabled(options.state) && tile.fogged) continue;
      if (!inBox(tile.x, tile.y)) continue;
      const ox = Math.floor(wxToPx(tile.x));
      const oy = Math.floor(wyToPy(tile.y));
      options.miniMapCtx.fillStyle = hexWithAlpha(
        options.effectiveOverlayColor(tile.ownerId),
        tile.ownershipState === "SETTLED" ? 0.9 : 0.6
      );
      options.miniMapCtx.fillRect(ox, oy, 1, 1);
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
        options.miniMapCtx.fillStyle = fogStyle[runVis];
        options.miniMapCtx.fillRect(runStartPx, py, endPx - runStartPx, 1);
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

  options.miniMapCtx.fillStyle = "rgba(127, 238, 255, 0.9)";
  for (const pair of options.state.dockPairs) {
    if (!options.isDockRouteVisibleForPlayer(pair)) continue;
    const aKnown = options.state.tiles.get(options.keyFor(pair.ax, pair.ay));
    const bKnown = options.state.tiles.get(options.keyFor(pair.bx, pair.by));
    if (!effectiveFogDisabled(options.state) && ((!aKnown || aKnown.fogged) && (!bKnown || bKnown.fogged))) continue;
    if (inBox(pair.ax, pair.ay)) {
      const adx = Math.floor(wxToPx(pair.ax));
      const ady = Math.floor(wyToPy(pair.ay));
      options.miniMapCtx.fillRect(adx - 1, ady - 1, 3, 3);
    }
    if (inBox(pair.bx, pair.by)) {
      const bdx = Math.floor(wxToPx(pair.bx));
      const bdy = Math.floor(wyToPy(pair.by));
      options.miniMapCtx.fillRect(bdx - 1, bdy - 1, 3, 3);
    }
  }

  for (const tile of options.state.tiles.values()) {
    if (!tileHasTownIdentity(tile)) continue;
    if (!effectiveFogDisabled(options.state) && tile.fogged) continue;
    if (!inBox(tile.x, tile.y)) continue;
    const tx = Math.floor(wxToPx(tile.x));
    const ty = Math.floor(wyToPy(tile.y));
    const palette = miniMapTownMarkerPalette(tile, options.hasCollectableYield(tile));
    options.miniMapCtx.fillStyle = palette.outer;
    options.miniMapCtx.beginPath();
    options.miniMapCtx.arc(tx, ty, palette.radius, 0, Math.PI * 2);
    options.miniMapCtx.fill();
    options.miniMapCtx.fillStyle = palette.inner;
    options.miniMapCtx.beginPath();
    options.miniMapCtx.arc(tx, ty, options.hasCollectableYield(tile) ? 2.1 : 1.8, 0, Math.PI * 2);
    options.miniMapCtx.fill();
  }

  if (options.state.replayActive) {
    const replayEvent = options.replayCurrentEvent();
    if (replayEvent && replayEvent.x !== undefined && replayEvent.y !== undefined && inBox(replayEvent.x, replayEvent.y)) {
      const ex = Math.floor(wxToPx(replayEvent.x));
      const ey = Math.floor(wyToPy(replayEvent.y));
      options.miniMapCtx.strokeStyle = "rgba(255, 244, 171, 0.98)";
      options.miniMapCtx.lineWidth = 1.6;
      options.miniMapCtx.strokeRect(ex - 2, ey - 2, 5, 5);
    }
    if (replayEvent?.from && replayEvent?.to) {
      drawAetherBridgeLane(
        options.miniMapCtx,
        wxToPx(replayEvent.from.x),
        wyToPy(replayEvent.from.y),
        wxToPx(replayEvent.to.x),
        wyToPy(replayEvent.to.y),
        options.nowMs,
        { compact: true }
      );
    }
  }

  options.miniMapCtx.save();
  options.miniMapCtx.textAlign = "center";
  options.miniMapCtx.textBaseline = "middle";
  options.miniMapCtx.font = "8px monospace";
  for (const tile of options.state.tiles.values()) {
    const shardSite = visibleShardSiteForTile(tile, options.state.shardRainPingsByTile, options.nowMs);
    if (!shardSite) continue;
    if (!inBox(tile.x, tile.y)) continue;
    const tx = Math.floor(wxToPx(tile.x));
    const ty = Math.floor(wyToPy(tile.y));
    options.miniMapCtx.fillStyle = shardSite.kind === "FALL" ? "rgba(255, 244, 176, 0.98)" : "rgba(147, 235, 255, 0.96)";
    options.miniMapCtx.fillText(resourceIconForKey("SHARD"), tx, ty);
  }
  const pingPhase = 0.5 + 0.5 * Math.sin(options.nowMs / 240);
  options.miniMapCtx.lineWidth = 1.2;
  for (const [, ping] of options.state.shardRainPingsByTile) {
    if (!shardRainPingActiveAt(ping, options.nowMs)) continue;
    if (!inBox(ping.x, ping.y)) continue;
    const tx = Math.floor(wxToPx(ping.x));
    const ty = Math.floor(wyToPy(ping.y));
    options.miniMapCtx.strokeStyle = `rgba(255, 236, 170, ${0.55 + pingPhase * 0.25})`;
    options.miniMapCtx.beginPath();
    options.miniMapCtx.arc(tx, ty, 3.4 + pingPhase * 2.1, 0, Math.PI * 2);
    options.miniMapCtx.stroke();
  }
  options.miniMapCtx.restore();

  return true;
};
