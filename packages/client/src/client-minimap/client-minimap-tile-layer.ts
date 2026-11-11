// The minimap's content drawn tile by tile from the tiles the player knows, instead of stretching the
// 220px whole-world terrain base (client-dock-routes.ts buildMiniMapBaseRows). That base samples the
// 640x320 world at ~3 tiles per pixel, and the minimap then crops it to the explored area (50+ tiles
// across), so early on a few dozen base pixels were blown up into blobs and territory was 1px specks.
//
// With fog on, every non-black pixel on the minimap is a tile in state.tiles, which carries its terrain:
// no worldgen is needed, so the cost is one pass over known tiles. Each tile is a crisp square; owned
// tiles get their owner's tint and a solid edge where the owner changes; fogged tiles are dimmed and
// unexplored ground stays black. With fog off (map reveal) the caller keeps the whole-world base.

import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { unwrapIntoBox } from "./client-minimap-view-box.js";
import type { Tile } from "../client-types.js";

export type MiniMapBox = { x0: number; y0: number; w: number; h: number };

export type MiniMapTileLayerDeps = {
  tiles: ReadonlyMap<string, Tile>;
  keyFor: (x: number, y: number) => string;
  terrainColorAt: (x: number, y: number, terrain: Tile["terrain"]) => string;
  overlayColor: (ownerId: string) => string;
  tileVisibilityStateAt: (x: number, y: number, tile?: Tile) => "visible" | "fogged" | "unexplored";
  withAlpha: (hex: string, alpha: number) => string;
  /** The Resources lens (client-resource-lens.ts): undefined while off, else a resource colour or null for no paint. */
  lensTileColor?: (tile: Tile) => string | null | undefined;
};

export type TileRect = { x: number; y: number; w: number; h: number };

/** A tile's square on the canvas, snapped to whole pixels so neighbours meet without gaps or overlaps. */
export const miniMapTileRect = (tx: number, ty: number, box: MiniMapBox, canvasW: number, canvasH: number): TileRect => {
  const left = Math.floor(((tx - box.x0) / box.w) * canvasW);
  const right = Math.floor(((tx + 1 - box.x0) / box.w) * canvasW);
  const top = Math.floor(((ty - box.y0) / box.h) * canvasH);
  const bottom = Math.floor(((ty + 1 - box.y0) / box.h) * canvasH);
  return { x: left, y: top, w: Math.max(1, right - left), h: Math.max(1, bottom - top) };
};

/** Border thickness in px: none while a tile is under ~3px (the tint alone reads), then about a fifth of a tile. */
export const miniMapBorderPx = (tilePx: number): number => (tilePx < 3 ? 0 : Math.max(1, Math.round(tilePx * 0.18)));

/** A tile's position inside the frame, taking the copy across the world's edge when the frame runs past it; undefined when outside. */
export const miniMapBoxPoint = (x: number, y: number, box: MiniMapBox): { x: number; y: number } | undefined => {
  const ux = unwrapIntoBox(x, box.x0, WORLD_WIDTH);
  const uy = unwrapIntoBox(y, box.y0, WORLD_HEIGHT);
  return ux < box.x0 + box.w && uy < box.y0 + box.h ? { x: ux, y: uy } : undefined;
};

export const drawMiniMapTileLayer = (cctx: CanvasRenderingContext2D, box: MiniMapBox, w: number, h: number, deps: MiniMapTileLayerDeps): void => {
  cctx.fillStyle = "#000000";
  cctx.fillRect(0, 0, w, h);
  const shown: Array<{ tile: Tile; r: TileRect }> = [];
  for (const tile of deps.tiles.values()) {
    const at = miniMapBoxPoint(tile.x, tile.y, box);
    if (at) shown.push({ tile, r: miniMapTileRect(at.x, at.y, box, w, h) });
  }

  for (const { tile, r } of shown) {
    cctx.fillStyle = deps.terrainColorAt(tile.x, tile.y, tile.terrain);
    cctx.fillRect(r.x, r.y, r.w, r.h);
  }

  const border = miniMapBorderPx(w / box.w);
  for (const { tile, r } of shown) {
    const lensColor = deps.lensTileColor?.(tile);
    if (lensColor === null || tile.fogged) continue;
    if (lensColor) {
      cctx.fillStyle = lensColor;
      cctx.fillRect(r.x, r.y, r.w, r.h);
      continue;
    }
    if (!tile.ownerId) continue;
    const color = deps.overlayColor(tile.ownerId);
    cctx.fillStyle = deps.withAlpha(color, tile.ownershipState === "SETTLED" ? 0.72 : 0.48);
    cctx.fillRect(r.x, r.y, r.w, r.h);
    if (border === 0) continue;
    // A solid edge on each side where the neighbour isn't this owner's: the territory's outline.
    const owner = tile.ownerId;
    const other = (dx: number, dy: number): boolean =>
      deps.tiles.get(deps.keyFor(unwrapIntoBox(tile.x + dx, 0, WORLD_WIDTH), unwrapIntoBox(tile.y + dy, 0, WORLD_HEIGHT)))?.ownerId !== owner;
    cctx.fillStyle = color;
    if (other(0, -1)) cctx.fillRect(r.x, r.y, r.w, border);
    if (other(0, 1)) cctx.fillRect(r.x, r.y + r.h - border, r.w, border);
    if (other(-1, 0)) cctx.fillRect(r.x, r.y, border, r.h);
    if (other(1, 0)) cctx.fillRect(r.x + r.w - border, r.y, border, r.h);
  }

  for (const { tile, r } of shown) {
    const vis = deps.tileVisibilityStateAt(tile.x, tile.y, tile);
    if (vis === "visible") continue;
    cctx.fillStyle = vis === "unexplored" ? "#000000" : "rgba(0,0,0,0.62)";
    cctx.fillRect(r.x, r.y, r.w, r.h);
  }
};

/**
 * Draws the frame's part of a whole-world image (the minimap terrain base) onto the w x h canvas. A frame that
 * runs past the world's edge is drawn in up to four pieces, each from its own side of the image.
 */
export const drawWrappedWorldImage = (
  cctx: CanvasRenderingContext2D,
  image: HTMLCanvasElement,
  box: MiniMapBox,
  w: number,
  h: number
): void => {
  const sx = image.width / WORLD_WIDTH;
  const sy = image.height / WORLD_HEIGHT;
  const pieces = (start: number, size: number, world: number): Array<{ from: number; at: number; size: number }> => {
    const firstSize = Math.min(size, world - start);
    const out = [{ from: start, at: 0, size: firstSize }];
    if (size > firstSize) out.push({ from: 0, at: firstSize, size: size - firstSize });
    return out;
  };
  for (const px of pieces(box.x0, box.w, WORLD_WIDTH)) {
    for (const py of pieces(box.y0, box.h, WORLD_HEIGHT)) {
      if (px.size <= 0 || py.size <= 0) continue;
      cctx.drawImage(
        image,
        px.from * sx,
        py.from * sy,
        px.size * sx,
        py.size * sy,
        (px.at / box.w) * w,
        (py.at / box.h) * h,
        (px.size / box.w) * w,
        (py.size / box.h) * h
      );
    }
  }
};
