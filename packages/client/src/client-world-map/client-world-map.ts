// The world map: tapping the corner minimap (or World on the phone map overview) opens the whole world full
// screen. Land the player knows is drawn against the world's outline, unexplored ground stays fog, the player's
// own land is in their colour and their current view is outlined. Tapping a place moves the camera there and
// closes the map; ✕, Esc and a tap off the world close it too.
//
// It is a DOM overlay above the map canvas, so it is the same for the 2D and true-3D renderers: both follow
// state.camX/camY. Drawing cost: the picture (one pixel per tile, client-world-map-pixels.ts) lives on a cached
// 640x320 offscreen canvas rebuilt only when known tiles change (at most every REBUILD_MS while open); each
// frame only scales that image and strokes the view rectangle, and only when something changed.

import { WORLD_HEIGHT, WORLD_WIDTH, terrainAt as worldgenTerrainAt } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { jumpCameraToTile, type CameraJumpDeps } from "../client-minimap/client-minimap-camera-jump.js";
import { buildDiscoveredLayer, buildWorldMapPixels } from "./client-world-map-pixels.js";
import { canvasBackingSize, fitWorldRect, viewRectPieces, worldTileAtPoint, type Rect } from "./client-world-map-geometry.js";

export type WorldMapDeps = CameraJumpDeps & {
  state: Pick<ClientState, "camX" | "camY" | "camSubX" | "camSubY" | "zoom" | "me" | "tiles" | "tilesRevision" | "discoveredTiles">;
  /** The main map canvas: its size over the zoom is the view's size in tiles, as on the minimap. */
  mapCanvas: HTMLCanvasElement;
  ownerColor: (ownerId: string) => string;
  /** Worldgen terrain for explored tiles the client no longer holds (defaults to the shared seeded terrainAt). */
  terrainAt?: (x: number, y: number) => Tile["terrain"];
};

export const WORLD_MAP_ID = "world-map";
const REBUILD_MS = 500;
const MAX_CANVAS_PX = 2048;

type OpenOptions = { onPicked?: () => void };

type Controller = { open: (options?: OpenOptions) => void; close: () => void; isOpen: () => boolean };
let controller: Controller | undefined;

export const openWorldMap = (options?: OpenOptions): void => controller?.open(options);
export const closeWorldMap = (): void => controller?.close();
export const isWorldMapOpen = (): boolean => controller?.isOpen() ?? false;

const overlayHtml = `<div class="world-map-panel">
  <div class="world-map-head">
    <div><h2 class="world-map-title">World</h2><p class="world-map-hint">Tap a place to go there</p></div>
    <div class="world-map-key"><span class="world-map-key-own">your land</span><span class="world-map-key-view">your view</span></div>
    <button type="button" class="world-map-close" data-world-map-close aria-label="Close the world map">✕</button>
  </div>
  <canvas class="world-map-canvas" aria-label="World map: tap a place to go there"></canvas>
</div>`;

export const installWorldMap = (deps: WorldMapDeps): Controller => {
  controller?.close();
  document.getElementById(WORLD_MAP_ID)?.remove();
  const root = document.createElement("div");
  root.id = WORLD_MAP_ID;
  root.className = "world-map";
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-label", "World map");
  root.innerHTML = overlayHtml;
  document.body.appendChild(root);
  const canvas = root.querySelector<HTMLCanvasElement>(".world-map-canvas")!;
  const ctx = canvas.getContext("2d");

  const image = document.createElement("canvas");
  image.width = WORLD_WIDTH;
  image.height = WORLD_HEIGHT;
  const imageCtx = image.getContext("2d");
  let imageData: ImageData | undefined;
  let layer: Uint8ClampedArray | undefined;
  let layerFor = -1;
  let builtFor = { size: -1, revision: Number.NaN, me: "", color: "", discovered: -1, at: 0 };

  let open = false;
  let onPicked: (() => void) | undefined;
  let frame = 0;
  let drawn = { camX: Number.NaN, camY: Number.NaN, zoom: Number.NaN, w: 0, h: 0, built: -1 };

  const rebuildImage = (nowMs: number, force: boolean): boolean => {
    const s = deps.state;
    const color = s.me ? deps.ownerColor(s.me) : "";
    const discovered = s.discoveredTiles.size;
    const stale =
      builtFor.size !== s.tiles.size ||
      builtFor.revision !== s.tilesRevision ||
      builtFor.me !== s.me ||
      builtFor.color !== color ||
      builtFor.discovered !== discovered;
    if (!stale || (!force && nowMs - builtFor.at < REBUILD_MS) || !imageCtx) return false;
    imageData ??= imageCtx.createImageData(WORLD_WIDTH, WORLD_HEIGHT);
    // The explored layer is a pass over every explored tile, so it is rebuilt only when discoveredTiles changes size.
    if (!layer || layerFor !== discovered) {
      layer = buildDiscoveredLayer({ discovered: s.discoveredTiles, terrainAt: deps.terrainAt ?? worldgenTerrainAt, out: layer });
      layerFor = discovered;
    }
    buildWorldMapPixels({ tiles: s.tiles.values(), discovered: s.discoveredTiles, layer, meId: s.me, ownColor: color, out: imageData.data });
    imageCtx.putImageData(imageData, 0, 0);
    if (color) root.style.setProperty("--world-map-own", color);
    builtFor = { size: s.tiles.size, revision: s.tilesRevision, me: s.me, color, discovered, at: nowMs };
    return true;
  };

  const fitCanvas = (): void => {
    const { w, h } = canvasBackingSize(canvas.clientWidth, canvas.clientHeight, window.devicePixelRatio, MAX_CANVAS_PX);
    if (w > 0 && canvas.width !== w) canvas.width = w;
    if (h > 0 && canvas.height !== h) canvas.height = h;
  };

  const worldRect = (): Rect => fitWorldRect(canvas.width, canvas.height);

  const draw = (): void => {
    if (!ctx) return;
    const s = deps.state;
    const r = worldRect();
    const unchanged =
      drawn.camX === s.camX && drawn.camY === s.camY && drawn.zoom === s.zoom && drawn.w === canvas.width && drawn.h === canvas.height && drawn.built === builtFor.at;
    if (unchanged || r.w <= 0) return;
    drawn = { camX: s.camX, camY: s.camY, zoom: s.zoom, w: canvas.width, h: canvas.height, built: builtFor.at };
    const ui = Math.max(1, canvas.width / 640);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const smoothing = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, r.x, r.y, r.w, r.h);
    ctx.imageSmoothingEnabled = smoothing;
    // The world's outer bounds: its size is no secret, only what lies inside it.
    ctx.strokeStyle = "rgba(217, 178, 92, 0.85)";
    ctx.lineWidth = 1.5 * ui;
    ctx.strokeRect(r.x + ctx.lineWidth / 2, r.y + ctx.lineWidth / 2, r.w - ctx.lineWidth, r.h - ctx.lineWidth);
    const sx = r.w / WORLD_WIDTH;
    const sy = r.h / WORLD_HEIGHT;
    const viewW = deps.mapCanvas.width / Math.max(0.0001, s.zoom);
    const viewH = deps.mapCanvas.height / Math.max(0.0001, s.zoom);
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();
    ctx.strokeStyle = "rgba(255, 240, 180, 0.95)";
    ctx.lineWidth = 1.5 * ui;
    for (const p of viewRectPieces(s.camX, s.camY, viewW, viewH)) {
      ctx.strokeRect(r.x + p.x * sx, r.y + p.y * sy, Math.max(2, p.w * sx), Math.max(2, p.h * sy));
    }
    ctx.fillStyle = "#ffd166";
    ctx.beginPath();
    ctx.arc(r.x + s.camX * sx, r.y + s.camY * sy, 2.5 * ui, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  const tick = (): void => {
    frame = 0;
    if (!open) return;
    fitCanvas();
    rebuildImage(performance.now(), false);
    draw();
    frame = requestAnimationFrame(tick);
  };

  const close = (): void => {
    if (!open) return;
    open = false;
    onPicked = undefined;
    root.hidden = true;
    document.body.classList.remove("world-map-open");
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  };

  const show = (options?: OpenOptions): void => {
    onPicked = options?.onPicked;
    if (open) return;
    open = true;
    root.hidden = false;
    document.body.classList.add("world-map-open");
    drawn.built = -1;
    rebuildImage(performance.now(), true);
    frame = requestAnimationFrame(tick);
    root.querySelector<HTMLElement>("[data-world-map-close]")?.focus();
  };

  canvas.addEventListener("click", (event) => {
    const bounds = canvas.getBoundingClientRect();
    const r = fitWorldRect(bounds.width, bounds.height);
    const tile = worldTileAtPoint(event.clientX - bounds.left, event.clientY - bounds.top, r);
    const picked = onPicked;
    close();
    if (!tile) return;
    jumpCameraToTile(deps.state, deps, tile.x, tile.y);
    picked?.();
  });
  root.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    // ✕, or the dark backdrop around the panel.
    if (target?.closest("[data-world-map-close]") || target === root) close();
  });
  window.addEventListener(
    "keydown",
    (event) => {
      if (!open || event.key !== "Escape") return;
      close();
      // The HUD's own Esc (Settings, the phone overview) listens on window too.
      event.stopImmediatePropagation();
    },
    true
  );

  controller = { open: show, close, isOpen: () => open };
  return controller;
};
