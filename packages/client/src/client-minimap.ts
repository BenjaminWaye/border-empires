import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { drawAetherBridgeLane, hexWithAlpha } from "./client-map-render.js";
import { resourceIconForKey } from "./client-map-display.js";
import type { DockPair, StrategicReplayEvent, Tile } from "./client-types.js";

type ReplayTileView = { ownerId?: string; ownershipState?: Tile["ownershipState"] };

export const miniMapTownMarkerPalette = (
  tile: Tile,
  hasCollectableYield: boolean
): { outer: string; inner: string; radius: number } => {
  const outer = "rgba(6, 10, 18, 0.86)";
  const radius = hasCollectableYield ? 3.6 : 3.2;
  let inner = "rgba(196, 169, 255, 0.94)";
  if (hasCollectableYield) inner = "rgba(255, 220, 118, 0.96)";
  else if (tile.town?.type === "MARKET") inner = "rgba(255, 214, 112, 0.94)";
  else if (tile.town?.type === "FARMING") inner = "rgba(157, 236, 130, 0.94)";
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
  };
  canvas: HTMLCanvasElement;
  miniMapEl: HTMLCanvasElement;
  miniMapCtx: CanvasRenderingContext2D;
  miniMapBase: HTMLCanvasElement;
  miniMapBaseReady: boolean;
  miniMapLast: { camX: number; camY: number; zoom: number; replayIndex: number; drawAt: number };
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

  options.miniMapCtx.drawImage(options.miniMapBase, 0, 0);
  if (options.state.replayActive) {
    for (const [tileKey, replayTile] of options.state.replayOwnershipByTile) {
      if (!replayTile.ownerId) continue;
      const { x, y } = options.parseKey(tileKey);
      const px = Math.floor((x / WORLD_WIDTH) * w);
      const py = Math.floor((y / WORLD_HEIGHT) * h);
      options.miniMapCtx.fillStyle = hexWithAlpha(
        options.effectiveOverlayColor(replayTile.ownerId),
        replayTile.ownershipState === "SETTLED" ? 0.9 : 0.6
      );
      options.miniMapCtx.fillRect(px, py, 1, 1);
    }
  }

  if (!options.state.fogDisabled) {
    for (let py = 0; py < h; py += 1) {
      for (let px = 0; px < w; px += 1) {
        const wx = Math.floor((px / w) * WORLD_WIDTH);
        const wy = Math.floor((py / h) * WORLD_HEIGHT);
        const tile = options.state.tiles.get(options.keyFor(wx, wy));
        const vis = options.tileVisibilityStateAt(wx, wy, tile);
        if (vis === "unexplored") {
          options.miniMapCtx.fillStyle = "#000000";
          options.miniMapCtx.fillRect(px, py, 1, 1);
        } else if (vis === "fogged") {
          options.miniMapCtx.fillStyle = "rgba(0,0,0,0.62)";
          options.miniMapCtx.fillRect(px, py, 1, 1);
        }
      }
    }
  }

  const viewTilesW = options.canvas.width / options.state.zoom;
  const viewTilesH = options.canvas.height / options.state.zoom;
  const vx = ((options.state.camX - viewTilesW / 2 + WORLD_WIDTH) % WORLD_WIDTH) / WORLD_WIDTH;
  const vy = ((options.state.camY - viewTilesH / 2 + WORLD_HEIGHT) % WORLD_HEIGHT) / WORLD_HEIGHT;
  const vw = Math.min(1, viewTilesW / WORLD_WIDTH);
  const vh = Math.min(1, viewTilesH / WORLD_HEIGHT);

  options.miniMapCtx.strokeStyle = "rgba(255, 240, 180, 0.95)";
  options.miniMapCtx.lineWidth = 1.5;
  options.miniMapCtx.strokeRect(vx * w, vy * h, Math.max(2, vw * w), Math.max(2, vh * h));

  const px = (options.state.camX / WORLD_WIDTH) * w;
  const py = (options.state.camY / WORLD_HEIGHT) * h;
  options.miniMapCtx.fillStyle = "#ffd166";
  options.miniMapCtx.beginPath();
  options.miniMapCtx.arc(px, py, 2.8, 0, Math.PI * 2);
  options.miniMapCtx.fill();

  options.miniMapCtx.fillStyle = "rgba(127, 238, 255, 0.9)";
  for (const pair of options.state.dockPairs) {
    if (!options.isDockRouteVisibleForPlayer(pair)) continue;
    const aKnown = options.state.tiles.get(options.keyFor(pair.ax, pair.ay));
    const bKnown = options.state.tiles.get(options.keyFor(pair.bx, pair.by));
    if (!options.state.fogDisabled && ((!aKnown || aKnown.fogged) && (!bKnown || bKnown.fogged))) continue;
    const adx = Math.floor((pair.ax / WORLD_WIDTH) * w);
    const ady = Math.floor((pair.ay / WORLD_HEIGHT) * h);
    const bdx = Math.floor((pair.bx / WORLD_WIDTH) * w);
    const bdy = Math.floor((pair.by / WORLD_HEIGHT) * h);
    options.miniMapCtx.fillRect(adx - 1, ady - 1, 3, 3);
    options.miniMapCtx.fillRect(bdx - 1, bdy - 1, 3, 3);
  }

  for (const tile of options.state.tiles.values()) {
    if (!tile.town) continue;
    if (!options.state.fogDisabled && tile.fogged) continue;
    const tx = Math.floor((tile.x / WORLD_WIDTH) * w);
    const ty = Math.floor((tile.y / WORLD_HEIGHT) * h);
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
    if (replayEvent && replayEvent.x !== undefined && replayEvent.y !== undefined) {
      const ex = Math.floor((replayEvent.x / WORLD_WIDTH) * w);
      const ey = Math.floor((replayEvent.y / WORLD_HEIGHT) * h);
      options.miniMapCtx.strokeStyle = "rgba(255, 244, 171, 0.98)";
      options.miniMapCtx.lineWidth = 1.6;
      options.miniMapCtx.strokeRect(ex - 2, ey - 2, 5, 5);
    }
    if (replayEvent?.from && replayEvent?.to) {
      drawAetherBridgeLane(
        options.miniMapCtx,
        (replayEvent.from.x / WORLD_WIDTH) * w,
        (replayEvent.from.y / WORLD_HEIGHT) * h,
        (replayEvent.to.x / WORLD_WIDTH) * w,
        (replayEvent.to.y / WORLD_HEIGHT) * h,
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
    if (!tile.shardSite) continue;
    if (!options.state.fogDisabled && tile.fogged) continue;
    const tx = Math.floor((tile.x / WORLD_WIDTH) * w);
    const ty = Math.floor((tile.y / WORLD_HEIGHT) * h);
    options.miniMapCtx.fillStyle = tile.shardSite.kind === "FALL" ? "rgba(255, 244, 176, 0.98)" : "rgba(147, 235, 255, 0.96)";
    options.miniMapCtx.fillText(resourceIconForKey("SHARD"), tx, ty);
  }
  options.miniMapCtx.restore();

  return true;
};
