import type { Tile, TileVisibilityState } from "../client-types.js";
import { FOGGED_PRINT_LAND_AGE, FOGGED_PRINT_SEPIA, FOGGED_PRINT_WATER, FOGGED_PRINT_WATER_AGE } from "../client-unexplored-storm/client-unexplored-storm-palette.js";
import {
  drawUnexploredStormEdge2D,
  drawUnexploredStormTile,
  isUnexploredCoastRing,
  unexploredCoastVisibleAt
} from "../client-unexplored-storm/client-unexplored-storm-2d.js";

// The 2D canvas renderer's base layer for one tile (extracted from
// client-runtime-loop.ts's per-tile loop): terrain, fogged dimming, or the
// unexplored storm. Remembered (fogged) tiles keep their terrain and natural
// detail as a sepia survey print. The fog's first ring (unexplored tiles touching explored
// land) shows its own ground under a see-through parchment coast,
// with the storm beyond. Explored tiles get only their own terrain -- the
// fog never draws on them. Overlays (forest, ownership tint, structures...)
// draw on top of this.
export type TileGround2DInput = {
  readonly wx: number;
  readonly wy: number;
  readonly px: number;
  readonly py: number;
  readonly size: number;
  readonly tile: Tile | undefined;
  readonly vis: TileVisibilityState;
  /** Terrain to draw for a tile with no data yet (map not loaded / fog off / reveal), or undefined to show storm. */
  readonly terrainWhenMissing: Tile["terrain"] | undefined;
  /** Terrain of any world tile -- used for the fog's first ring, which has no tile data. */
  readonly terrainAt: (wx: number, wy: number) => Tile["terrain"];
  readonly drawTerrainTile: (wx: number, wy: number, terrain: Tile["terrain"], px: number, py: number, size: number) => void;
  /** Natural terrain detail (forest, hills) for a land tile -- drawn on the fog's first ring too. */
  readonly drawTerrainDetail: (wx: number, wy: number, px: number, py: number, size: number) => void;
  /** Whether the tile at offset (ox, oy) from this one is unexplored. */
  readonly isUnexploredAt: (ox: number, oy: number) => boolean;
};

const isWater = (terrain: Tile["terrain"]): boolean => terrain === "SEA" || terrain === "COASTAL_SEA";
// Remembered (fogged) tiles as an aged survey print, matching the 3D fog
// overlay: a "color" blend takes the print's hue while keeping the terrain's
// own light and dark, then a warm multiply ages it. Canvases without blend
// modes just get a translucent wash of the same tone.
const drawFoggedPrint = (ctx: CanvasRenderingContext2D, terrain: Tile["terrain"], px: number, py: number, size: number): void => {
  ctx.save();
  ctx.globalCompositeOperation = "color";
  ctx.globalAlpha = isWater(terrain) ? 0.75 : 0.9;
  ctx.fillStyle = isWater(terrain) ? FOGGED_PRINT_WATER : FOGGED_PRINT_SEPIA;
  ctx.fillRect(px, py, size, size);
  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = 1;
  ctx.fillStyle = isWater(terrain) ? FOGGED_PRINT_WATER_AGE : FOGGED_PRINT_LAND_AGE;
  ctx.fillRect(px, py, size, size);
  ctx.restore();
};


export const drawTileGround2D = (ctx: CanvasRenderingContext2D, input: TileGround2DInput): void => {
  const { wx, wy, px, py, size, tile, vis } = input;
  if (vis === "unexplored") {
    const isExploredAt = (ox: number, oy: number): boolean => !input.isUnexploredAt(ox, oy);
    if (!unexploredCoastVisibleAt(size) || !isUnexploredCoastRing(isExploredAt)) {
      drawUnexploredStormTile(ctx, wx, wy, px, py, size);
      return;
    }
    const terrain = input.terrainAt(wx, wy);
    input.drawTerrainTile(wx, wy, isWater(terrain) || terrain === "MOUNTAIN" ? terrain : "LAND", px, py, size);
    if (terrain === "LAND") input.drawTerrainDetail(wx, wy, px, py, size);
    // No fog dim: the parchment wash on top mutes it, and a darkened ring
    // read as a hole beside explored land.
    drawUnexploredStormEdge2D(ctx, wx, wy, px, py, size, isExploredAt);
    return;
  }
  if (!tile) {
    if (input.terrainWhenMissing === undefined) drawUnexploredStormTile(ctx, wx, wy, px, py, size);
    else input.drawTerrainTile(wx, wy, input.terrainWhenMissing, px, py, size);
  } else if (vis === "fogged") {
    input.drawTerrainTile(wx, wy, tile.terrain, px, py, size);
    if (tile.terrain === "LAND") input.drawTerrainDetail(wx, wy, px, py, size); // natural terrain isn't live data
    drawFoggedPrint(ctx, tile.terrain, px, py, size);
  } else {
    input.drawTerrainTile(wx, wy, isWater(tile.terrain) || tile.terrain === "MOUNTAIN" ? tile.terrain : "LAND", px, py, size);
  }
};
