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
    save: vi.fn(), restore: vi.fn(), globalAlpha: 1, beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
    closePath: vi.fn(), fill: vi.fn(), stroke: vi.fn(), arc: vi.fn(),
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
  terrainAt: () => "SEA",
  drawTerrainTile: vi.fn(),
  drawTerrainDetail: vi.fn(),
  isUnexploredAt: () => false,
  ...over
});

describe("drawTileGround2D", () => {
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

  it("never draws the fog on explored tiles, only on the fog tile facing them", () => {
    const explored = makeCtx();
    drawTileGround2D(explored.ctx, input({ isUnexploredAt: () => true }));
    expect(explored.raw.clip).not.toHaveBeenCalled();
    expect(explored.raw.stroke).not.toHaveBeenCalled();
  });

  it("draws a first-ring fog tile's own ground, undimmed, under the coast", () => {
    const ring = makeCtx();
    const args = input({ tile: undefined, vis: "unexplored", isUnexploredAt: (ox, oy) => !(ox === 1 && oy === 0) });
    drawTileGround2D(ring.ctx, args);
    expect(args.drawTerrainTile).toHaveBeenCalledWith(3, 4, "SEA", 0, 0, 40);
    expect(ring.fills.some((f) => f.startsWith("rgba(7, 20, 34") || f.startsWith("rgba(2, 5, 10"))).toBe(false); // no fog dim

    expect(args.drawTerrainDetail).not.toHaveBeenCalled(); // sea has no forest/hills

    const landRing = makeCtx();
    const landArgs = input({ tile: undefined, vis: "unexplored", terrainAt: () => "LAND", isUnexploredAt: (ox, oy) => !(ox === 1 && oy === 0) });
    drawTileGround2D(landRing.ctx, landArgs);
    expect(landArgs.drawTerrainDetail).toHaveBeenCalledWith(3, 4, 0, 0, 40);
    expect(ring.raw.stroke).toHaveBeenCalled();
  });

  it("draws deep fog as plain storm, with no ground underneath", () => {
    const deep = makeCtx();
    const args = input({ tile: undefined, vis: "unexplored", isUnexploredAt: () => true });
    drawTileGround2D(deep.ctx, args);
    expect(args.drawTerrainTile).not.toHaveBeenCalled();
    expect(deep.raw.stroke).not.toHaveBeenCalled();
    expect(args.drawTerrainDetail).not.toHaveBeenCalled();
  });
});
