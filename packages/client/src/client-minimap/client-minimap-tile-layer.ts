// The minimap's content drawn tile by tile from the tiles the player knows, instead of stretching the
// 220px whole-world terrain base (client-dock-routes.ts buildMiniMapBaseRows). That base samples the
// 640x320 world at ~3 tiles per pixel, and the minimap then crops it to the explored area (50+ tiles
// across), so early on a few dozen base pixels were blown up into blobs and territory was 1px specks.
//
// With fog on, every non-black pixel on the minimap is a tile in state.tiles, which carries its terrain:
// no worldgen is needed, so the cost is one pass over known tiles. Each tile is a crisp square; owned
// tiles get their owner's tint and a solid edge where the owner changes; fogged tiles are dimmed and
// unexplored ground stays black. With fog off (map reveal) the caller keeps the whole-world base.

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

const inBox = (x: number, y: number, box: MiniMapBox): boolean => x >= box.x0 && y >= box.y0 && x < box.x0 + box.w && y < box.y0 + box.h;

export const drawMiniMapTileLayer = (cctx: CanvasRenderingContext2D, box: MiniMapBox, w: number, h: number, deps: MiniMapTileLayerDeps): void => {
  cctx.fillStyle = "#000000";
  cctx.fillRect(0, 0, w, h);
  const shown: Tile[] = [];
  for (const tile of deps.tiles.values()) if (inBox(tile.x, tile.y, box)) shown.push(tile);

  for (const tile of shown) {
    const r = miniMapTileRect(tile.x, tile.y, box, w, h);
    cctx.fillStyle = deps.terrainColorAt(tile.x, tile.y, tile.terrain);
    cctx.fillRect(r.x, r.y, r.w, r.h);
  }

  const border = miniMapBorderPx(w / box.w);
  for (const tile of shown) {
    const lensColor = deps.lensTileColor?.(tile);
    if (lensColor === null || tile.fogged) continue;
    const r = miniMapTileRect(tile.x, tile.y, box, w, h);
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
    const other = (dx: number, dy: number): boolean => deps.tiles.get(deps.keyFor(tile.x + dx, tile.y + dy))?.ownerId !== owner;
    cctx.fillStyle = color;
    if (other(0, -1)) cctx.fillRect(r.x, r.y, r.w, border);
    if (other(0, 1)) cctx.fillRect(r.x, r.y + r.h - border, r.w, border);
    if (other(-1, 0)) cctx.fillRect(r.x, r.y, border, r.h);
    if (other(1, 0)) cctx.fillRect(r.x + r.w - border, r.y, border, r.h);
  }

  for (const tile of shown) {
    const vis = deps.tileVisibilityStateAt(tile.x, tile.y, tile);
    if (vis === "visible") continue;
    const r = miniMapTileRect(tile.x, tile.y, box, w, h);
    cctx.fillStyle = vis === "unexplored" ? "#000000" : "rgba(0,0,0,0.62)";
    cctx.fillRect(r.x, r.y, r.w, r.h);
  }
};
