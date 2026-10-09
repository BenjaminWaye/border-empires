import type { Tile, TileVisibilityState } from "../client-types.js";
import {
  drawUnexploredStormEdge2D,
  drawUnexploredStormTile,
  isUnexploredCoastRing,
  unexploredCoastVisibleAt
} from "../client-unexplored-storm/client-unexplored-storm-2d.js";

// The 2D canvas renderer's base layer for one tile (extracted from
// client-runtime-loop.ts's per-tile loop): terrain, fogged dimming, or the
// unexplored storm. The fog's first ring (unexplored tiles touching explored
// land) shows its own ground dimmed under a see-through parchment coast,
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
const fogDim = (terrain: Tile["terrain"]): string => (isWater(terrain) ? "rgba(7, 20, 34, 0.34)" : "rgba(2, 5, 10, 0.72)");

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
    // Lighter than remembered-tile fog: the parchment wash on top already
    // mutes it, and the full fog dim would bury the trees and hills.
    ctx.fillStyle = isWater(terrain) ? "rgba(7, 20, 34, 0.25)" : "rgba(2, 5, 10, 0.35)";
    ctx.fillRect(px, py, size, size);
    drawUnexploredStormEdge2D(ctx, wx, wy, px, py, size, isExploredAt);
    return;
  }
  if (!tile) {
    if (input.terrainWhenMissing === undefined) drawUnexploredStormTile(ctx, wx, wy, px, py, size);
    else input.drawTerrainTile(wx, wy, input.terrainWhenMissing, px, py, size);
  } else if (vis === "fogged") {
    input.drawTerrainTile(wx, wy, tile.terrain, px, py, size);
    ctx.fillStyle = fogDim(tile.terrain);
    ctx.fillRect(px, py, size, size);
  } else {
    input.drawTerrainTile(wx, wy, isWater(tile.terrain) || tile.terrain === "MOUNTAIN" ? tile.terrain : "LAND", px, py, size);
  }
};
