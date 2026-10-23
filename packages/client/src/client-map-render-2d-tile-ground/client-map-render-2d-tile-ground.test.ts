import { describe, expect, it, vi } from "vitest";
import type { Tile } from "../client-types.js";
import { FOGGED_WASH, UNEXPLORED_LANTERN } from "../client-unexplored-storm/client-unexplored-storm-palette.js";
import { drawTileGround2D, type TileGround2DInput } from "./client-map-render-2d-tile-ground.js";
import { createUnexploredRevealTracker } from "../client-unexplored-storm/client-unexplored-reveal-2d.js";

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
  neighbourVisibility: () => "visible",
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

  it("prints a remembered tile whose data isn't loaded from its seed terrain, like the 3D map, not as storm", () => {
    const { ctx, fills } = makeCtx();
    const remembered = input({ tile: undefined, vis: "fogged", terrainAt: () => "LAND" });
    drawTileGround2D(ctx, remembered);
    expect(remembered.drawTerrainTile).toHaveBeenCalledWith(3, 4, "LAND", 0, 0, 40);
    expect(remembered.drawTerrainDetail).toHaveBeenCalled();
    expect(fills).toContain(FOGGED_WASH);
  });

  it("washes fogged tiles in slate with their natural detail, and draws visible land as LAND", () => {
    const fogged = makeCtx();
    const foggedArgs = input({ vis: "fogged" });
    drawTileGround2D(fogged.ctx, foggedArgs);
    expect(foggedArgs.drawTerrainDetail).toHaveBeenCalledWith(3, 4, 0, 0, 40);
    expect(fogged.fills).toContain(FOGGED_WASH);
    expect(fogged.fills.some((f) => f.startsWith("rgba(2, 5, 10"))).toBe(false); // no black dim any more
    const visibleArgs = input({ tile: { x: 3, y: 4, terrain: "MOUNTAIN" } as Tile });
    drawTileGround2D(makeCtx().ctx, visibleArgs);
    expect(visibleArgs.drawTerrainTile).toHaveBeenCalledWith(3, 4, "MOUNTAIN", 0, 0, 40);
    expect(visibleArgs.drawTerrainDetail).not.toHaveBeenCalled(); // live tiles get it from the main loop
  });

  it("ends a remembered tile's fog a band in from a neighbour in sight, like the storm's coast", () => {
    const beside = makeCtx();
    drawTileGround2D(beside.ctx, input({ vis: "fogged", neighbourVisibility: (ox, oy) => (ox === -1 && oy === 0 ? "visible" : "fogged") }));
    expect(beside.raw.clip).toHaveBeenCalled();
    expect(beside.raw.stroke).toHaveBeenCalled(); // the mist bank along the edge
    expect(beside.fills).toContain(FOGGED_WASH);

    const inner = makeCtx();
    drawTileGround2D(inner.ctx, input({ vis: "fogged", neighbourVisibility: () => "fogged" }));
    expect(inner.raw.clip).not.toHaveBeenCalled();
    expect(inner.raw.stroke).not.toHaveBeenCalled();
  });

  it("never draws the fog on explored tiles, only on the fog tile facing them", () => {
    const explored = makeCtx();
    drawTileGround2D(explored.ctx, input({ neighbourVisibility: () => "unexplored" }));
    expect(explored.raw.clip).not.toHaveBeenCalled();
    expect(explored.raw.stroke).not.toHaveBeenCalled();
  });

  it("draws a first-ring fog tile's own ground, undimmed, under the coast", () => {
    const ring = makeCtx();
    const args = input({ tile: undefined, vis: "unexplored", neighbourVisibility: (ox, oy) => (ox === 1 && oy === 0 ? "visible" : "unexplored") });
    drawTileGround2D(ring.ctx, args);
    expect(args.drawTerrainTile).toHaveBeenCalledWith(3, 4, "SEA", 0, 0, 40);
    expect(ring.fills.some((f) => f.startsWith("rgba(7, 20, 34") || f.startsWith("rgba(2, 5, 10"))).toBe(false); // no fog dim

    expect(args.drawTerrainDetail).not.toHaveBeenCalled(); // sea has no forest/hills

    const landRing = makeCtx();
    const landArgs = input({ tile: undefined, vis: "unexplored", terrainAt: () => "LAND", neighbourVisibility: (ox, oy) => (ox === 1 && oy === 0 ? "visible" : "unexplored") });
    drawTileGround2D(landRing.ctx, landArgs);
    expect(landArgs.drawTerrainDetail).toHaveBeenCalledWith(3, 4, 0, 0, 40);
    expect(ring.raw.stroke).toHaveBeenCalled();
  });

  it("prints a ring tile like the remembered land it borders, but not beside land in sight", () => {
    const besideFogged = makeCtx();
    drawTileGround2D(besideFogged.ctx, input({ tile: undefined, vis: "unexplored", terrainAt: () => "LAND", neighbourVisibility: (ox, oy) => (ox === 1 && oy === 0 ? "fogged" : "unexplored") }));
    expect(besideFogged.fills).toContain(FOGGED_WASH);

    const besideLive = makeCtx();
    drawTileGround2D(besideLive.ctx, input({ tile: undefined, vis: "unexplored", terrainAt: () => "LAND", neighbourVisibility: (ox, oy) => (ox === 1 && oy === 0 ? "visible" : ox === -1 && oy === 0 ? "fogged" : "unexplored") }));
    expect(besideLive.fills).not.toContain(FOGGED_WASH);
  });

  it("draws deep fog as plain storm, with no ground underneath", () => {
    const deep = makeCtx();
    const args = input({ tile: undefined, vis: "unexplored", neighbourVisibility: () => "unexplored" });
    drawTileGround2D(deep.ctx, args);
    expect(args.drawTerrainTile).not.toHaveBeenCalled();
    expect(deep.raw.stroke).not.toHaveBeenCalled();
    expect(args.drawTerrainDetail).not.toHaveBeenCalled();
  });

  it("fades the storm off a tile, with a lantern flash, when it becomes explored", () => {
    const tracker = createUnexploredRevealTracker();
    tracker.observe("99,99", false, 0); // explored land already on the map (not a first load)
    const before = makeCtx();
    drawTileGround2D(before.ctx, input({ tile: undefined, vis: "unexplored", neighbourVisibility: () => "unexplored", nowMs: 0 }), tracker);
    const after = makeCtx();
    drawTileGround2D(after.ctx, input({ vis: "visible", nowMs: 10 }), tracker);
    expect(after.fills).toContain(UNEXPLORED_LANTERN);
    const later = makeCtx();
    drawTileGround2D(later.ctx, input({ vis: "visible", nowMs: 5000 }), tracker);
    expect(later.fills).not.toContain(UNEXPLORED_LANTERN);
  });
});
