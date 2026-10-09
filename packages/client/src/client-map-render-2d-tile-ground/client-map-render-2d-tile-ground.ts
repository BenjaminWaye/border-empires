import type { Tile, TileVisibilityState } from "../client-types.js";
import { drawUnexploredStormEdge2D, drawUnexploredStormTile } from "../client-unexplored-storm/client-unexplored-storm-2d.js";

// The 2D canvas renderer's base layer for one tile (extracted from
// client-runtime-loop.ts's per-tile loop): terrain, fogged dimming, or the
// unexplored storm with its parchment/foam border along any side facing
// explored land. Explored tiles get only their own terrain -- the fog border
// never draws on them. Overlays (forest, ownership tint, structures...)
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
  readonly drawTerrainTile: (wx: number, wy: number, terrain: Tile["terrain"], px: number, py: number, size: number) => void;
  /** Whether the tile at offset (ox, oy) from this one is unexplored. */
  readonly isUnexploredAt: (ox: number, oy: number) => boolean;
};

const isWater = (terrain: Tile["terrain"]): boolean => terrain === "SEA" || terrain === "COASTAL_SEA";

export const drawTileGround2D = (ctx: CanvasRenderingContext2D, input: TileGround2DInput): void => {
  const { wx, wy, px, py, size, tile, vis } = input;
  if (vis === "unexplored") {
    drawUnexploredStormTile(ctx, wx, wy, px, py, size);
    drawUnexploredStormEdge2D(ctx, wx, wy, px, py, size, (ox, oy) => !input.isUnexploredAt(ox, oy));
    return;
  }
  if (!tile) {
    if (input.terrainWhenMissing === undefined) drawUnexploredStormTile(ctx, wx, wy, px, py, size);
    else input.drawTerrainTile(wx, wy, input.terrainWhenMissing, px, py, size);
  } else if (vis === "fogged") {
    input.drawTerrainTile(wx, wy, tile.terrain, px, py, size);
    ctx.fillStyle = isWater(tile.terrain) ? "rgba(7, 20, 34, 0.34)" : "rgba(2, 5, 10, 0.72)";
    ctx.fillRect(px, py, size, size);
  } else {
    input.drawTerrainTile(wx, wy, isWater(tile.terrain) || tile.terrain === "MOUNTAIN" ? tile.terrain : "LAND", px, py, size);
  }
};
