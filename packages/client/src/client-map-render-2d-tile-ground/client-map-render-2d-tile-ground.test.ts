import { describe, expect, it, vi } from "vitest";
import type { Tile } from "../client-types.js";
import { drawTileGround2D, type TileGround2DInput } from "./client-map-render-2d-tile-ground.js";

const makeCtx = () => {
  const fills: string[] = [];
  const ctx = {
    fillStyle: "",
    fillRect: vi.fn(() => {
      fills.push(String(ctx.fillStyle));
    }),
    save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
    closePath: vi.fn(), fill: vi.fn(), stroke: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() }))
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, fills, raw: ctx };
};

const input = (over: Partial<TileGround2DInput>): TileGround2DInput => ({
  wx: 3, wy: 4, px: 0, py: 0, size: 40,
  tile: { x: 3, y: 4, terrain: "LAND" } as Tile,
  vis: "visible",
  terrainWhenMissing: undefined,
  drawTerrainTile: vi.fn(),
  isUnexploredAt: () => false,
  ...over
});

describe("drawTileGround2D", () => {
  it("draws storm (no terrain) on unexplored tiles", () => {
    const { ctx } = makeCtx();
    const args = input({ vis: "unexplored" });
    drawTileGround2D(ctx, args);
    expect(args.drawTerrainTile).not.toHaveBeenCalled();
  });

  it("draws terrain for a tile with no data only when terrainWhenMissing is given", () => {
    const shown = input({ tile: undefined, terrainWhenMissing: "SEA" });
    drawTileGround2D(makeCtx().ctx, shown);
    expect(shown.drawTerrainTile).toHaveBeenCalledWith(3, 4, "SEA", 0, 0, 40);
    const hidden = input({ tile: undefined });
    drawTileGround2D(makeCtx().ctx, hidden);
    expect(hidden.drawTerrainTile).not.toHaveBeenCalled();
  });

  it("dims fogged tiles and draws visible land as LAND", () => {
    const fogged = makeCtx();
    const foggedArgs = input({ vis: "fogged" });
    drawTileGround2D(fogged.ctx, foggedArgs);
    expect(fogged.fills).toContain("rgba(2, 5, 10, 0.72)");
    const visibleArgs = input({ tile: { x: 3, y: 4, terrain: "MOUNTAIN" } as Tile });
    drawTileGround2D(makeCtx().ctx, visibleArgs);
    expect(visibleArgs.drawTerrainTile).toHaveBeenCalledWith(3, 4, "MOUNTAIN", 0, 0, 40);
  });

  it("adds the storm border on explored tiles that face unexplored ones", () => {
    const { ctx, raw } = makeCtx();
    drawTileGround2D(ctx, input({ isUnexploredAt: (ox, oy) => ox === 1 && oy === 0 }));
    expect(raw.stroke).toHaveBeenCalled();
    const inland = makeCtx();
    drawTileGround2D(inland.ctx, input({}));
    expect(inland.raw.stroke).not.toHaveBeenCalled();
  });
});
