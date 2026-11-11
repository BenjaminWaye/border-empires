import { beforeAll, describe, expect, it } from "vitest";
import type { Tile } from "../client-types.js";
import { drawMiniMapTileLayer, miniMapBorderPx, miniMapTileRect, type MiniMapBox } from "./client-minimap-tile-layer.js";
import { makeFakeCtx } from "./client-minimap.test-helpers.js";

let drawMiniMap: typeof import("./client-minimap.js").drawMiniMap;

beforeAll(async () => {
  Object.assign(globalThis, { Image: class { decoding = ""; src = ""; } });
  ({ drawMiniMap } = await import("./client-minimap.js"));
});

const tile = (x: number, y: number, over: Partial<Tile> = {}): Tile => ({ x, y, terrain: "LAND", ...over });
const mapOf = (tiles: Tile[]): Map<string, Tile> => new Map(tiles.map((t) => [`${t.x},${t.y}`, t]));
const BOX: MiniMapBox = { x0: 0, y0: 0, w: 10, h: 10 };

const layerDeps = (tiles: Map<string, Tile>) => ({
  tiles,
  keyFor: (x: number, y: number) => `${x},${y}`,
  terrainColorAt: () => "#228822",
  overlayColor: () => "#3366cc",
  tileVisibilityStateAt: (_x: number, _y: number, t?: Tile) => (t?.fogged ? ("fogged" as const) : ("visible" as const)),
  withAlpha: (hex: string, a: number) => `${hex}@${a}`
});

describe("minimap tile layer", () => {
  it("snaps tiles to whole-pixel squares that meet without gaps", () => {
    const a = miniMapTileRect(0, 0, { x0: 0, y0: 0, w: 3, h: 3 }, 100, 100);
    const b = miniMapTileRect(1, 0, { x0: 0, y0: 0, w: 3, h: 3 }, 100, 100);
    expect(a.x + a.w).toBe(b.x);
    expect(a.w).toBeGreaterThanOrEqual(33);
    // Never thinner than a pixel, even zoomed far out.
    expect(miniMapTileRect(5, 5, { x0: 0, y0: 0, w: 640, h: 320 }, 220, 220).w).toBe(1);
  });

  it("draws no outline on tiny tiles and about a fifth of a tile on big ones", () => {
    expect(miniMapBorderPx(2)).toBe(0);
    expect(miniMapBorderPx(10)).toBe(2);
    expect(miniMapBorderPx(40)).toBe(7);
  });

  // Regression: the minimap stretched a 220px whole-world terrain base (~3 tiles per pixel) over the explored
  // area, so terrain came out as blobs and each owned tile was a single-pixel speck.
  it("paints each known tile as a full square, its owner's tint over it, and black where nothing is known", () => {
    const ctx = makeFakeCtx();
    const tiles = mapOf([tile(2, 2), tile(3, 2, { ownerId: "me", ownershipState: "SETTLED" })]);
    drawMiniMapTileLayer(ctx, BOX, 100, 100, layerDeps(tiles));
    expect(ctx.fillRectCalls[0]).toMatchObject({ x: 0, y: 0, w: 100, h: 100, style: "#000000" });
    expect(ctx.fillRectCalls.filter((c) => c.style === "#228822")).toEqual([
      { x: 20, y: 20, w: 10, h: 10, style: "#228822" },
      { x: 30, y: 20, w: 10, h: 10, style: "#228822" }
    ]);
    expect(ctx.fillRectCalls).toContainEqual({ x: 30, y: 20, w: 10, h: 10, style: "#3366cc@0.72" });
  });

  it("outlines a territory only on sides that border someone else's or no one's land", () => {
    const ctx = makeFakeCtx();
    const tiles = mapOf([tile(4, 4, { ownerId: "me" }), tile(5, 4, { ownerId: "me" })]);
    drawMiniMapTileLayer(ctx, BOX, 100, 100, layerDeps(tiles));
    const edges = ctx.fillRectCalls.filter((c) => c.style === "#3366cc");
    // Two tiles side by side: top, bottom and outer side each, nothing on the shared side (6 edges, not 8).
    expect(edges).toHaveLength(6);
    expect(edges.some((e) => e.x === 48 && e.w === 2)).toBe(false);
    expect(edges.some((e) => e.x === 50 && e.w === 2)).toBe(false);
  });

  it("dims fogged tiles and skips their owner tint", () => {
    const ctx = makeFakeCtx();
    drawMiniMapTileLayer(ctx, BOX, 100, 100, layerDeps(mapOf([tile(1, 1, { ownerId: "rival", fogged: true })])));
    expect(ctx.fillRectCalls.some((c) => c.style.startsWith("#3366cc"))).toBe(false);
    expect(ctx.fillRectCalls).toContainEqual({ x: 10, y: 10, w: 10, h: 10, style: "rgba(0,0,0,0.62)" });
  });

  it("on the Resources lens paints resource tiles in their colour and drops all territory tint and outline", () => {
    const ctx = makeFakeCtx();
    const tiles = mapOf([tile(1, 1, { ownerId: "me", resource: "FARM" }), tile(2, 1, { ownerId: "rival" }), tile(3, 1, { resource: "GEMS" })]);
    const lensTileColor = (t: Tile): string | null => (t.resource === "FARM" ? "#e9f27b" : t.resource === "GEMS" ? "#b175ff" : null);
    drawMiniMapTileLayer(ctx, BOX, 100, 100, { ...layerDeps(tiles), lensTileColor });
    expect(ctx.fillRectCalls.some((c) => c.style.startsWith("#3366cc"))).toBe(false);
    expect(ctx.fillRectCalls).toContainEqual({ x: 10, y: 10, w: 10, h: 10, style: "#e9f27b" });
    expect(ctx.fillRectCalls).toContainEqual({ x: 30, y: 10, w: 10, h: 10, style: "#b175ff" });
  });
});

describe("drawMiniMap with the tile layer", () => {
  const draw = (opts: { baseReady: boolean; contentPx: number; computedAt: number; perTileAllowed?: boolean }) => {
    const ctx = makeFakeCtx();
    const contentCtx = makeFakeCtx();
    const tiles = mapOf([tile(10, 10, { ownerId: "me", ownershipState: "SETTLED" })]);
    const changed = drawMiniMap({
      nowMs: 10_000,
      state: { camX: 10, camY: 10, zoom: 1, replayActive: false, replayIndex: 0, replayOwnershipByTile: new Map(), fogDisabled: false, tiles, dockPairs: [], tilesRevision: 0 },
      canvas: { width: 200, height: 200 } as HTMLCanvasElement,
      miniMapEl: { width: 220, height: 220 } as HTMLCanvasElement,
      miniMapCtx: ctx,
      miniMapContentEl: { width: opts.contentPx, height: opts.contentPx } as HTMLCanvasElement,
      miniMapContentCtx: contentCtx,
      miniMapBase: { width: 220, height: 220 } as HTMLCanvasElement,
      miniMapBaseReady: opts.baseReady,
      miniMapLast: { camX: 10, camY: 10, zoom: 1, replayIndex: 0, tileCount: 1, tilesRevision: 0 },
      contentCache: { computedAt: opts.computedAt, ...(opts.perTileAllowed === undefined ? {} : { perTileAllowed: opts.perTileAllowed }) },
      parseKey: (key) => { const [x, y] = key.split(",").map(Number); return { x: x ?? 0, y: y ?? 0 }; },
      keyFor: (x, y) => `${x},${y}`,
      tileVisibilityStateAt: () => "visible",
      effectiveOverlayColor: () => "#3366cc",
      isDockRouteVisibleForPlayer: () => false,
      replayCurrentEvent: () => undefined,
      terrainColorAt: () => "#228822"
    });
    return { changed, contentCtx };
  };

  it("draws known tiles before the whole-world terrain base has finished building", () => {
    const { contentCtx } = draw({ baseReady: false, contentPx: 220, computedAt: 0 });
    expect(contentCtx.fillRectCalls.some((c) => c.style === "#228822")).toBe(true);
  });

  // Regression: the early return ignored a resized canvas, so the phone overview (which renders the minimap at
  // screen resolution) stayed blank until the camera moved.
  // Regression: turning map reveal off (or a replay ending) switches drawing modes, but nothing marked the content
  // dirty, so the other mode's picture stayed until a tile changed.
  it("repaints when the drawing mode switches, even with the camera and tiles unchanged", () => {
    expect(draw({ baseReady: true, contentPx: 220, computedAt: 5_000, perTileAllowed: true }).changed).toBe(false);
    expect(draw({ baseReady: true, contentPx: 220, computedAt: 5_000, perTileAllowed: false }).changed).toBe(true);
  });

  it("redraws when the canvas has been resized, even with the camera and tiles unchanged", () => {
    expect(draw({ baseReady: true, contentPx: 220, computedAt: 5_000 }).changed).toBe(false);
    expect(draw({ baseReady: true, contentPx: 440, computedAt: 5_000 }).changed).toBe(true);
  });
});

describe("drawMiniMap fallback path on a large canvas", () => {
  // Regression: with map reveal (fog off) the whole-world base path still drew owned tiles as 1px dots, so on the
  // phone overview's ~960px canvas territory all but vanished; and its per-pixel fog scan grew ~19x.
  it("paints owned tiles at tile size and samples fog in blocks", () => {
    const contentCtx = makeFakeCtx();
    const size = 880;
    const tiles = mapOf([tile(10, 10, { ownerId: "me", ownershipState: "SETTLED" })]);
    drawMiniMap({
      nowMs: 10_000,
      state: { camX: 10, camY: 10, zoom: 1, replayActive: true, replayIndex: 1, replayOwnershipByTile: new Map([["10,10", { ownerId: "me", ownershipState: "SETTLED" }]]), fogDisabled: false, tiles, dockPairs: [], tilesRevision: 0 },
      canvas: { width: 200, height: 200 } as HTMLCanvasElement,
      miniMapEl: { width: size, height: size } as HTMLCanvasElement,
      miniMapCtx: makeFakeCtx(),
      miniMapContentEl: { width: size, height: size } as HTMLCanvasElement,
      miniMapContentCtx: contentCtx,
      miniMapBase: { width: 220, height: 220 } as HTMLCanvasElement,
      miniMapBaseReady: true,
      miniMapLast: { camX: -1, camY: -1, zoom: -1, replayIndex: -1, tileCount: -1, tilesRevision: -1 },
      contentCache: { computedAt: 0 },
      parseKey: (key) => { const [x, y] = key.split(",").map(Number); return { x: x ?? 0, y: y ?? 0 }; },
      keyFor: (x, y) => `${x},${y}`,
      tileVisibilityStateAt: (_x, _y, t) => (t ? "visible" : "unexplored"),
      effectiveOverlayColor: () => "#3366cc",
      isDockRouteVisibleForPlayer: () => false,
      replayCurrentEvent: () => undefined,
      terrainColorAt: () => "#228822"
    });
    // A replay keeps the base path even with a terrain colour given.
    expect(contentCtx.fillRectCalls.some((c) => c.style === "#228822")).toBe(false);
    const owned = contentCtx.fillRectCalls.filter((c) => c.style.startsWith("rgba(51, 102, 204") || c.style.startsWith("#3366cc"));
    expect(owned.length).toBeGreaterThan(0);
    expect(Math.min(...owned.map((c) => c.w))).toBeGreaterThanOrEqual(Math.floor(size / 50) - 1);
    const fog = contentCtx.fillRectCalls.filter((c) => c.style === "#000000");
    expect(fog.length).toBeGreaterThan(0);
    // One run per sampled block row (step 4 at 880px), not per pixel row.
    expect(fog.every((c) => c.h === 4)).toBe(true);
    expect(fog.length).toBeLessThanOrEqual(size / 4 * 3);
  });

  it("falls back to the base path when the frame is too big to draw tile by tile cheaply", () => {
    const contentCtx = makeFakeCtx();
    // Known tiles spread across the world: the frame is far over the tile-layer limit.
    const tiles = mapOf([tile(0, 0), tile(600, 300), tile(300, 150, { ownerId: "me" })]);
    drawMiniMap({
      nowMs: 10_000,
      state: { camX: 10, camY: 10, zoom: 1, replayActive: false, replayIndex: 0, replayOwnershipByTile: new Map(), fogDisabled: false, tiles, dockPairs: [], tilesRevision: 0 },
      canvas: { width: 200, height: 200 } as HTMLCanvasElement,
      miniMapEl: { width: 220, height: 220 } as HTMLCanvasElement,
      miniMapCtx: makeFakeCtx(),
      miniMapContentEl: { width: 220, height: 220 } as HTMLCanvasElement,
      miniMapContentCtx: contentCtx,
      miniMapBase: { width: 220, height: 220 } as HTMLCanvasElement,
      miniMapBaseReady: true,
      miniMapLast: { camX: -1, camY: -1, zoom: -1, replayIndex: -1, tileCount: -1, tilesRevision: -1 },
      contentCache: { computedAt: 0 },
      parseKey: (key) => { const [x, y] = key.split(",").map(Number); return { x: x ?? 0, y: y ?? 0 }; },
      keyFor: (x, y) => `${x},${y}`,
      tileVisibilityStateAt: () => "visible",
      effectiveOverlayColor: () => "#3366cc",
      isDockRouteVisibleForPlayer: () => false,
      replayCurrentEvent: () => undefined,
      terrainColorAt: () => "#228822"
    });
    expect(contentCtx.fillRectCalls.some((c) => c.style === "#228822")).toBe(false);
  });
});
