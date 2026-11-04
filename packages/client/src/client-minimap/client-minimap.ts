import { relicRemainingUses } from "@border-empires/shared";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { drawAetherBridgeLane, hexWithAlpha } from "../client-map-render/client-map-render.js";
import { computeMiniMapViewBox } from "../client-minimap-view-box.js";
import { townIdentityForTile, tileHasTownIdentity } from "../client-town-identity.js";
import { effectiveFogDisabled } from "../client-map-reveal/client-map-reveal.js";
import { drawMiniMapTileLayer, miniMapTileRect } from "./client-minimap-tile-layer.js";
import type { DockPair, StrategicReplayEvent, Tile } from "../client-types.js";

type ReplayTileView = { ownerId?: string; ownershipState?: Tile["ownershipState"] };

export type MiniMapContentCache = {
  computedAt: number;
  box?: { x0: number; y0: number; w: number; h: number };
  /** Whether the last recompute could draw tile by tile; a switch (map reveal, a replay) repaints at once. */
  perTileAllowed?: boolean;
};

/** Tile-by-tile drawing costs a few fills per known tile, so it is used only while the framed area is at most this many tiles. */
export const MINIMAP_TILE_LAYER_MAX_TILES = 20_000;

export const miniMapTownMarkerPalette = (tile: Tile): { outer: string; inner: string; radius: number } => {
  const outer = "rgba(6, 10, 18, 0.86)";
  const radius = 3.2;
  let inner = "rgba(196, 169, 255, 0.94)";
  const town = townIdentityForTile(tile);
  if (town?.type === "MARKET") inner = "rgba(255, 214, 112, 0.94)";
  else if (town?.type === "FARMING") inner = "rgba(157, 236, 130, 0.94)";
  return { outer, inner, radius };
};

// Content-layer recompute floor, in ms. Matches the previous single throttle: tile/replay
// churn waits for this window, but it no longer gates camera/zoom responsiveness (see below).
const CONTENT_RECOMPUTE_FLOOR_MS = 140;

// World is toroidal (see wrapX/wrapY in @border-empires/shared), but the view
// box computed above never wraps — it's a plain rectangle bounding explored
// territory. A coordinate can therefore sit far outside the box in raw terms
// while actually being close by the wraparound path (e.g. explored land near
// x=440 and a site at x=10 on a 450-wide world). Shifting the coordinate by a
// world-size increment toward the box center picks whichever copy is nearest.
const wrapCoordNearBoxCenter = (coord: number, boxMin: number, boxSize: number, worldSize: number): number => {
  const center = boxMin + boxSize / 2;
  const diff = coord - center;
  if (diff > worldSize / 2) return coord - worldSize;
  if (diff < -worldSize / 2) return coord + worldSize;
  return coord;
};

export type MiniMapEdgeArrow = { x: number; y: number; angle: number };

// Clamps a pixel point that falls outside the [0,w]x[0,h] minimap canvas onto
// its border, along the ray from the canvas center through that point,
// inset by `margin` px — used to draw a direction indicator for things (like
// a distant relic hint) that fell outside the minimap's current view
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
    // Bumped on any visually relevant tile change (see tileRevisionRelevantChange
    // in client-tile-merge.ts) -- e.g. a waystation/watchtower flipping
    // `activated`, which never changes tiles.size. Without this, the content
    // layer's dirty check only fired on tile count or replay-index changes, so
    // a captured waystation's minimap dot kept showing its pre-capture bright
    // color until some unrelated tile was added or removed.
    tilesRevision: number;
    relicMapHints?: ReadonlyMap<string, import("@border-empires/shared").RelicMapHint>;
    dockPairs: DockPair[];
  };
  canvas: HTMLCanvasElement;
  miniMapEl: HTMLCanvasElement;
  miniMapCtx: CanvasRenderingContext2D;
  // Offscreen layer holding everything that doesn't depend on the camera/zoom (owner tints,
  // fog, docks, town/watchtower markers). Recomputing this is the expensive part (several
  // full tile-map scans plus a per-pixel fog pass); it's cached here and only redrawn per
  // contentCache's own throttle, never on every camera/zoom-changed frame.
  miniMapContentEl: HTMLCanvasElement;
  miniMapContentCtx: CanvasRenderingContext2D;
  miniMapBase: HTMLCanvasElement;
  miniMapBaseReady: boolean;
  /** colorKey: owner colours in force (the Diplomacy view swaps them); a change repaints the content layer. */
  miniMapLast: { camX: number; camY: number; zoom: number; replayIndex: number; tileCount: number; tilesRevision: number; colorKey?: string };
  colorKey?: string;
  // Mutable cache the caller persists across calls; this function reads and writes it directly.
  contentCache: MiniMapContentCache;
  parseKey: (key: string) => { x: number; y: number };
  keyFor: (x: number, y: number) => string;
  tileVisibilityStateAt: (x: number, y: number, tile?: Tile) => "visible" | "fogged" | "unexplored";
  effectiveOverlayColor: (ownerId: string) => string;
  isDockRouteVisibleForPlayer: (pair: DockPair) => boolean;
  replayCurrentEvent: () => StrategicReplayEvent | undefined;
  /** Terrain colour of a known tile; when given, fog is on and no replay runs, the content is drawn tile by tile (client-minimap-tile-layer.ts). */
  terrainColorAt?: (x: number, y: number, terrain: Tile["terrain"]) => string;
}): boolean => {
  // Camera/zoom moves need an immediate redraw of the viewport indicator for input
  // responsiveness, but they must NOT force a recompute of the expensive content layer below —
  // that stays gated by contentDirty + the throttle floor regardless of how often the camera
  // moves (e.g. a rapid zoom gesture fires many camera-moved frames per second).
  const cameraMoved =
    options.state.camX !== options.miniMapLast.camX ||
    options.state.camY !== options.miniMapLast.camY ||
    options.state.zoom !== options.miniMapLast.zoom;
  // Tile by tile from known tiles (client-minimap-tile-layer.ts) needs fog on and no replay; the whole-world
  // base is only needed when fog is off (every tile shows) or a replay repaints ownership.
  const perTileAllowed = options.terrainColorAt !== undefined && !effectiveFogDisabled(options.state) && !options.state.replayActive;
  const contentDirty =
    perTileAllowed !== (options.contentCache.perTileAllowed ?? perTileAllowed) ||
    options.state.tiles.size !== options.miniMapLast.tileCount ||
    options.state.tilesRevision !== options.miniMapLast.tilesRevision ||
    options.colorKey !== options.miniMapLast.colorKey ||
    (options.state.replayActive && options.state.replayIndex !== options.miniMapLast.replayIndex);
  // A resized canvas (the phone map overview renders at screen resolution) is blank until redrawn.
  const sizeChanged = options.miniMapContentEl.width !== options.miniMapEl.width || options.miniMapContentEl.height !== options.miniMapEl.height;
  if (!cameraMoved && !contentDirty && !sizeChanged && options.contentCache.computedAt !== 0) return false;

  const w = options.miniMapEl.width;
  const h = options.miniMapEl.height;
  const drawPlaceholder = (): true => {
    options.miniMapCtx.clearRect(0, 0, w, h);
    options.miniMapCtx.fillStyle = "#0b1320";
    options.miniMapCtx.fillRect(0, 0, w, h);
    options.miniMapCtx.strokeStyle = "rgba(255,255,255,0.25)";
    options.miniMapCtx.strokeRect(0.5, 0.5, w - 1, h - 1);
    return true;
  };
  // Drawing tile by tile needs no whole-world base, so with fog on the minimap shows before the base is built.
  if (!options.miniMapBaseReady && !perTileAllowed) return drawPlaceholder();

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

    // Crisp squares and territory outlines while the frame is small enough to be cheap and tiles are at least a
    // pixel; zoomed far out (late game, a big frame) the whole-world base reads the same and costs a fixed amount.
    const tilePx = w / box.w;
    const perTile = perTileAllowed && tilePx >= 1 && box.w * box.h <= MINIMAP_TILE_LAYER_MAX_TILES;
    if (!perTile && !options.miniMapBaseReady) return drawPlaceholder();
    // Markers keep their size on the 220px corner minimap's usual frame (~4.4px tiles) and grow with bigger tiles.
    const markerScale = Math.max(1, Math.min(4, tilePx / 4.4));
    // Line widths and small marks are tuned for the 220px canvas; scale them when it renders larger.
    const uiScale = Math.max(1, w / 220);
    options.contentCache.perTileAllowed = perTileAllowed;
    if (perTile && options.terrainColorAt) {
      drawMiniMapTileLayer(cctx, box, w, h, {
        tiles: options.state.tiles,
        keyFor: options.keyFor,
        terrainColorAt: options.terrainColorAt,
        overlayColor: options.effectiveOverlayColor,
        tileVisibilityStateAt: options.tileVisibilityStateAt,
        withAlpha: hexWithAlpha
      });
    } else {
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
          const r = miniMapTileRect(x, y, box, w, h);
          cctx.fillStyle = hexWithAlpha(options.effectiveOverlayColor(replayTile.ownerId), replayTile.ownershipState === "SETTLED" ? 0.9 : 0.6);
          cctx.fillRect(r.x, r.y, r.w, r.h);
        }
      } else {
        for (const tile of options.state.tiles.values()) {
          if (!tile.ownerId) continue;
          if (!effectiveFogDisabled(options.state) && tile.fogged) continue;
          if (!inBox(tile.x, tile.y)) continue;
          const r = miniMapTileRect(tile.x, tile.y, box, w, h);
          cctx.fillStyle = hexWithAlpha(options.effectiveOverlayColor(tile.ownerId), tile.ownershipState === "SETTLED" ? 0.9 : 0.6);
          cctx.fillRect(r.x, r.y, r.w, r.h);
        }
      }

      if (!effectiveFogDisabled(options.state)) {
        const fogStyle: Record<"unexplored" | "fogged", string> = {
          unexplored: "#000000",
          fogged: "rgba(0,0,0,0.62)"
        };
        // Sampled in blocks so a canvas larger than 220px (the phone overview) costs about the same.
        const step = Math.max(1, Math.floor(w / 220));
        for (let py = 0; py < h; py += step) {
          const wy = Math.floor(box.y0 + (py / h) * box.h);
          let runVis: "unexplored" | "fogged" | undefined;
          let runStartPx = 0;
          const flushRun = (endPx: number): void => {
            if (runVis === undefined) return;
            cctx.fillStyle = fogStyle[runVis];
            cctx.fillRect(runStartPx, py, endPx - runStartPx, step);
          };
          for (let px = 0; px < w; px += step) {
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
    }

    cctx.fillStyle = "rgba(127, 238, 255, 0.9)";
    for (const pair of options.state.dockPairs) {
      if (!options.isDockRouteVisibleForPlayer(pair)) continue;
      const aKnown = options.state.tiles.get(options.keyFor(pair.ax, pair.ay));
      const bKnown = options.state.tiles.get(options.keyFor(pair.bx, pair.by));
      if (!effectiveFogDisabled(options.state) && ((!aKnown || aKnown.fogged) && (!bKnown || bKnown.fogged))) continue;
      if (inBox(pair.ax, pair.ay)) {
        const d = 3 * markerScale;
        cctx.fillRect(wxToPx(pair.ax + 0.5) - d / 2, wyToPy(pair.ay + 0.5) - d / 2, d, d);
      }
      if (inBox(pair.bx, pair.by)) {
        const d = 3 * markerScale;
        cctx.fillRect(wxToPx(pair.bx + 0.5) - d / 2, wyToPy(pair.by + 0.5) - d / 2, d, d);
      }
    }

    for (const tile of options.state.tiles.values()) {
      if (!tileHasTownIdentity(tile)) continue;
      if (!effectiveFogDisabled(options.state) && tile.fogged) continue;
      if (!inBox(tile.x, tile.y)) continue;
      const tx = wxToPx(tile.x + 0.5);
      const ty = wyToPy(tile.y + 0.5);
      const palette = miniMapTownMarkerPalette(tile);
      cctx.fillStyle = palette.outer;
      cctx.beginPath();
      cctx.arc(tx, ty, palette.radius * markerScale, 0, Math.PI * 2);
      cctx.fill();
      cctx.fillStyle = palette.inner;
      cctx.beginPath();
      cctx.arc(tx, ty, 1.8 * markerScale, 0, Math.PI * 2);
      cctx.fill();
    }

    if (options.state.replayActive) {
      const replayEvent = options.replayCurrentEvent();
      if (replayEvent && replayEvent.x !== undefined && replayEvent.y !== undefined && inBox(replayEvent.x, replayEvent.y)) {
        const ex = Math.floor(wxToPx(replayEvent.x));
        const ey = Math.floor(wyToPy(replayEvent.y));
        cctx.strokeStyle = "rgba(255, 244, 171, 0.98)";
        cctx.lineWidth = 1.6 * uiScale;
        cctx.strokeRect(ex - 2 * markerScale, ey - 2 * markerScale, 5 * markerScale, 5 * markerScale);
      }
      if (replayEvent?.from && replayEvent?.to) {
        drawAetherBridgeLane(cctx, wxToPx(replayEvent.from.x), wyToPy(replayEvent.from.y), wxToPx(replayEvent.to.x), wyToPy(replayEvent.to.y), options.nowMs, {
          compact: true
        });
      }
    }

    cctx.save();
    const pingPhase = 0.5 + 0.5 * Math.sin(options.nowMs / 240);
    const drawRelicHint = (hint: import("@border-empires/shared").RelicMapHint): void => {
      const wrappedX = wrapCoordNearBoxCenter(hint.x, box.x0, box.w, WORLD_WIDTH);
      const wrappedY = wrapCoordNearBoxCenter(hint.y, box.y0, box.h, WORLD_HEIGHT);
      if (!inBox(wrappedX, wrappedY) && hint.kind !== "RELIC") return;
      const edge = !inBox(wrappedX, wrappedY) ? miniMapEdgeArrowPoint(wxToPx(wrappedX), wyToPy(wrappedY), w, h) : undefined;
      const x = edge?.x ?? wxToPx(wrappedX + 0.5), y = edge?.y ?? wyToPy(wrappedY + 0.5);
      const known = options.state.tiles.get(`${hint.x},${hint.y}`)?.naturalWonder;
      const depleted = known && relicRemainingUses(known) === 0;
      cctx.strokeStyle = depleted ? "#aba89c" : hint.kind === "RELIC" ? "#e7d69c" : "#a9d3bd";
      const k = markerScale; cctx.lineWidth = 1.5 * uiScale; cctx.strokeRect(x - 2.5 * k, y - 2.5 * k, 5 * k, 5 * k);
      if (edge) { cctx.save(); cctx.translate(x, y); cctx.rotate(edge.angle); cctx.beginPath(); cctx.moveTo(7, 0); cctx.lineTo(3, -3); cctx.lineTo(3, 3); cctx.closePath(); cctx.stroke(); cctx.restore(); }
      if (depleted) { cctx.beginPath(); cctx.moveTo(x - 3.5, y + 3.5); cctx.lineTo(x + 3.5, y - 3.5); cctx.stroke(); }
    };
    for (const hint of options.state.relicMapHints?.values() ?? []) drawRelicHint(hint);

    // Watchtowers: a dim marker while dormant, and — for ~10s right after a
    // player expands onto one — a bright expanding pulse ring over the
    // revealed 10x10-ish area (matches the 3D flicker; see
    // client-map-3d-watchtower-overlay.ts).
    for (const tile of options.state.tiles.values()) {
      if (tile.naturalWonder?.relicVersion === 1 && options.state.relicMapHints?.get(`${tile.x},${tile.y}`)?.kind !== "RELIC") drawRelicHint({ x: tile.x, y: tile.y, kind: "RELIC" });
      if (!tile.watchtower) continue;
      if (!effectiveFogDisabled(options.state) && tile.fogged && !tile.watchtower.activated) continue;
      if (!inBox(tile.x, tile.y)) continue;
      const tx = wxToPx(tile.x + 0.5);
      const ty = wyToPy(tile.y + 0.5);
      const revealing = typeof tile.watchtower.revealUntil === "number" && tile.watchtower.revealUntil > options.nowMs;
      // Brass/amber palette to match the steampunk 3D lantern beacon.
      cctx.fillStyle = tile.watchtower.activated ? "rgba(255, 190, 110, 0.95)" : "rgba(150, 120, 80, 0.75)";
      cctx.beginPath();
      cctx.arc(tx, ty, 2 * markerScale, 0, Math.PI * 2);
      cctx.fill();
      if (revealing) {
        cctx.strokeStyle = `rgba(255, 179, 71, ${0.5 + pingPhase * 0.35})`;
        cctx.lineWidth = 1.4;
        cctx.beginPath();
        cctx.arc(tx, ty, (5 + pingPhase * 3) * markerScale, 0, Math.PI * 2);
        cctx.stroke();
      }
    }

    // Waystations: a static marker (no timer, so no pulse ring, unlike a
    // watchtower's post-activation flicker) -- bright cyan while dormant
    // (inviting capture), dim cyan/grey once activated (matches the 3D
    // lens; see client-map-3d-waystation-overlay.ts).
    for (const tile of options.state.tiles.values()) {
      if (!tile.waystation) continue;
      if (!effectiveFogDisabled(options.state) && tile.fogged && !tile.waystation.activated) continue;
      if (!inBox(tile.x, tile.y)) continue;
      const tx = wxToPx(tile.x + 0.5);
      const ty = wyToPy(tile.y + 0.5);
      cctx.fillStyle = tile.waystation.activated ? "rgba(120, 150, 155, 0.7)" : "rgba(90, 220, 235, 0.95)";
      cctx.beginPath();
      cctx.arc(tx, ty, 2 * markerScale, 0, Math.PI * 2);
      cctx.fill();
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
  const uiScale = Math.max(1, w / 220);
  options.miniMapCtx.strokeStyle = "rgba(255, 240, 180, 0.95)";
  options.miniMapCtx.lineWidth = 1.5 * uiScale;
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
  options.miniMapCtx.arc(px, py, 2.8 * uiScale, 0, Math.PI * 2);
  options.miniMapCtx.fill();

  return true;
};
