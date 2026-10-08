// 2D-canvas renderer's half of the v9 edge rivers (the true-3D renderer
// carves them into the heightfield -- client-map-3d-heightfield-corners.ts +
// client-map-3d-rivers.ts). Rivers run along tile borders, so each land tile
// draws the half of the river channel that lies inside its own square on any
// of its four edges that carry a river; the neighbouring tile draws the other
// half, and the two meet on the shared border. Only v9+ seasons have edge
// rivers (riverEdgeKeysForCurrentSeed is empty before that), so v1-v8 seasons
// render exactly as before.
import { riverEdgeKey, riverEdgeKeysForCurrentSeed } from "@border-empires/shared";

// Same deep blue-teal as the 3D river water (client-map-3d-river-water-material.ts RIVER_WATER_CORE).
const RIVER_WATER = "rgba(22, 72, 96, 0.97)";
const RIVER_BANK = "rgba(28, 26, 18, 0.6)"; // dark wet bank so the edge reads as cut into the ground
const MIN_TILE_PX = 10;

export type TileRiverEdges = { top: boolean; right: boolean; bottom: boolean; left: boolean };

/** Which of tile (wx, wy)'s four borders a river runs along. */
export const tileRiverEdges = (wx: number, wy: number, edges: ReadonlySet<number> = riverEdgeKeysForCurrentSeed()): TileRiverEdges => ({
  top: edges.has(riverEdgeKey(wx, wy, "H")),
  bottom: edges.has(riverEdgeKey(wx, wy + 1, "H")),
  left: edges.has(riverEdgeKey(wx, wy, "V")),
  right: edges.has(riverEdgeKey(wx + 1, wy, "V"))
});

/**
 * Draws this tile's half of every river on its borders over the tile's top
 * face (px, py, w x h). "water" redraws only the water: the live ownership
 * tint calls it after filling the tile, so territory stops at the waterline
 * instead of hiding the river (docs/rivers-remake-plan.md decision 4).
 */
export const drawRiverEdges = (
  ctx: CanvasRenderingContext2D,
  wx: number,
  wy: number,
  px: number,
  py: number,
  w: number,
  h: number,
  layers: "bank-and-water" | "water" = "bank-and-water"
): void => {
  if (w < MIN_TILE_PX) return;
  const edges = riverEdgeKeysForCurrentSeed();
  if (edges.size === 0) return;
  // Inline lookups (no per-tile object): this runs per land tile per frame.
  const top = edges.has(riverEdgeKey(wx, wy, "H"));
  const bottom = edges.has(riverEdgeKey(wx, wy + 1, "H"));
  const left = edges.has(riverEdgeKey(wx, wy, "V"));
  const right = edges.has(riverEdgeKey(wx + 1, wy, "V"));
  if (!top && !right && !bottom && !left) return;
  const water = Math.max(2, Math.round(w * 0.1)); // this tile's half of the channel
  const bank = Math.max(1, Math.round(w * 0.05));
  const band = (x: number, y: number, bw: number, bh: number, color: string): void => {
    if (color === RIVER_BANK && layers === "water") return;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, bw, bh);
  };
  // Bank first (a strip just inside the water), then water flush to the border.
  if (top) { band(px, py + water, w, bank, RIVER_BANK); band(px, py, w, water, RIVER_WATER); }
  if (bottom) { band(px, py + h - water - bank, w, bank, RIVER_BANK); band(px, py + h - water, w, water, RIVER_WATER); }
  if (left) { band(px + water, py, bank, h, RIVER_BANK); band(px, py, water, h, RIVER_WATER); }
  if (right) { band(px + w - water - bank, py, bank, h, RIVER_BANK); band(px + w - water, py, water, h, RIVER_WATER); }
};
