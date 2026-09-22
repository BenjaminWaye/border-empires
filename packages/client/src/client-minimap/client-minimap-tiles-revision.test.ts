// Split out of client-minimap.test.ts (which was approaching the 500-line
// cap) -- covers the content-layer recompute dirty-check specifically,
// including the tilesRevision signal (see client-minimap.ts's contentDirty)
// that a tile mutating in place (e.g. a waystation's `activated` flipping,
// which never changes tiles.size) needs to actually mark the cache dirty.
import { beforeAll, describe, expect, it } from "vitest";
import type { Tile } from "../client-types.js";
import type { MiniMapContentCache } from "./client-minimap.js";
import { makeFakeCtx } from "./client-minimap.test-helpers.js";

let drawMiniMap: typeof import("./client-minimap.js").drawMiniMap;

beforeAll(async () => {
  class MockImage {
    decoding = "";
    src = "";
  }
  Object.assign(globalThis, { Image: MockImage });
  ({ drawMiniMap } = await import("./client-minimap.js"));
});

describe("drawMiniMap content-layer recompute throttle", () => {
  const baseCall = (overrides: {
    tileCount: number;
    nowMs: number;
    contentCache: MiniMapContentCache;
    camX?: number;
    camY?: number;
    zoom?: number;
    tilesRevision?: number;
    lastTilesRevision?: number;
  }): boolean => {
    const w = 8;
    const h = 8;
    const ctx = makeFakeCtx();
    const contentCtx = makeFakeCtx();
    const canvas = { width: 200, height: 200 } as HTMLCanvasElement;
    const miniMapEl = { width: w, height: h } as HTMLCanvasElement;
    const miniMapContentEl = { width: w, height: h } as HTMLCanvasElement;
    const miniMapBase = { width: w, height: h } as HTMLCanvasElement;

    return drawMiniMap({
      nowMs: overrides.nowMs,
      state: {
        camX: overrides.camX ?? 5,
        camY: overrides.camY ?? 5,
        zoom: overrides.zoom ?? 1,
        replayActive: false,
        replayIndex: 0,
        replayOwnershipByTile: new Map(),
        fogDisabled: true,
        tiles: new Map(),
        dockPairs: [],
        shardRainPingsByTile: new Map(),
        shardRainStatus: undefined,
        tilesRevision: overrides.tilesRevision ?? 0
      },
      canvas,
      miniMapEl,
      miniMapCtx: ctx,
      miniMapContentEl,
      miniMapContentCtx: contentCtx,
      miniMapBase,
      miniMapBaseReady: true,
      miniMapLast: {
        camX: 5,
        camY: 5,
        zoom: 1,
        replayIndex: 0,
        tileCount: overrides.tileCount,
        tilesRevision: overrides.lastTilesRevision ?? 0
      },
      contentCache: overrides.contentCache,
      parseKey: (key) => {
        const parts = key.split(",").map(Number);
        return { x: parts[0] ?? 0, y: parts[1] ?? 0 };
      },
      keyFor: (x, y) => `${x},${y}`,
      tileVisibilityStateAt: () => "visible",
      effectiveOverlayColor: () => "#ffffff",
      isDockRouteVisibleForPlayer: () => false,
      hasCollectableYield: () => false,
      replayCurrentEvent: () => undefined
    });
  };

  it("does not recompute the content layer for a tile-count-only change before the 140ms floor", () => {
    // state.tiles is empty (size 0); miniMapLast.tileCount = 3 makes this a content-dirty call.
    const contentCache: MiniMapContentCache = { computedAt: 10_000, box: { x0: 0, y0: 0, w: 450, h: 450 } };
    const changed = baseCall({ tileCount: 3, nowMs: 10_010, contentCache });
    expect(changed).toBe(true); // still blits the cached content + redraws the viewport indicator
    expect(contentCache.computedAt).toBe(10_000); // but does not recompute the expensive layer
  });

  it("recomputes the content layer once the 140ms floor has passed for a tile-count-only change", () => {
    const contentCache: MiniMapContentCache = { computedAt: 10_000, box: { x0: 0, y0: 0, w: 450, h: 450 } };
    const changed = baseCall({ tileCount: 3, nowMs: 10_141, contentCache });
    expect(changed).toBe(true);
    expect(contentCache.computedAt).toBe(10_141);
  });

  it("never triggers a content recompute on a camera/zoom-only change, however often it fires", () => {
    // tileCount matches state.tiles.size (0): this is a pure camera move, not content-dirty.
    const contentCache: MiniMapContentCache = { computedAt: 10_000, box: { x0: 0, y0: 0, w: 450, h: 450 } };
    const changed = baseCall({ tileCount: 0, nowMs: 10_010, camX: 6, contentCache });
    expect(changed).toBe(true); // viewport indicator still redraws immediately
    expect(contentCache.computedAt).toBe(10_000); // the expensive tile scans never re-run
  });

  it("always recomputes on the first draw regardless of camera/content state", () => {
    const contentCache: MiniMapContentCache = { computedAt: 0 };
    const changed = baseCall({ tileCount: 0, nowMs: 10_000, contentCache });
    expect(changed).toBe(true);
    expect(contentCache.computedAt).toBe(10_000);
  });

  it("recomputes the content layer on a tilesRevision-only change (tile count unchanged) -- e.g. a waystation flipping `activated`", () => {
    // Regression: the dirty check used to compare only tiles.size and replayIndex, so a
    // tile mutating in place (capturing a waystation never adds/removes a tile) never marked
    // the content layer dirty, and its minimap dot kept its pre-capture color indefinitely.
    const contentCache: MiniMapContentCache = { computedAt: 10_000, box: { x0: 0, y0: 0, w: 450, h: 450 } };
    const changed = baseCall({ tileCount: 0, nowMs: 10_141, tilesRevision: 5, lastTilesRevision: 4, contentCache });
    expect(changed).toBe(true);
    expect(contentCache.computedAt).toBe(10_141);
  });

  it("does not recompute for a tilesRevision-only change before the 140ms floor", () => {
    const contentCache: MiniMapContentCache = { computedAt: 10_000, box: { x0: 0, y0: 0, w: 450, h: 450 } };
    const changed = baseCall({ tileCount: 0, nowMs: 10_010, tilesRevision: 5, lastTilesRevision: 4, contentCache });
    expect(changed).toBe(true);
    expect(contentCache.computedAt).toBe(10_000);
  });
});

describe("drawMiniMap waystation marker", () => {
  const waystationTile = (activated: boolean): Tile => ({
    x: 10,
    y: 10,
    terrain: "LAND",
    waystation: { activated }
  });

  const drawWaystationDot = (tiles: Map<string, Tile>, tilesRevision: number, lastTilesRevision: number): ReturnType<typeof makeFakeCtx> => {
    const w = 64;
    const h = 64;
    const ctx = makeFakeCtx();
    const contentCtx = makeFakeCtx();
    const canvas = { width: 200, height: 200 } as HTMLCanvasElement;
    const miniMapEl = { width: w, height: h } as HTMLCanvasElement;
    const miniMapContentEl = { width: w, height: h } as HTMLCanvasElement;
    const miniMapBase = { width: w, height: h } as HTMLCanvasElement;

    drawMiniMap({
      nowMs: 10_000,
      state: {
        camX: 10,
        camY: 10,
        zoom: 1,
        replayActive: false,
        replayIndex: 0,
        replayOwnershipByTile: new Map(),
        fogDisabled: true,
        tiles,
        dockPairs: [],
        shardRainPingsByTile: new Map(),
        shardRainStatus: undefined,
        tilesRevision
      },
      canvas,
      miniMapEl,
      miniMapCtx: ctx,
      miniMapContentEl,
      miniMapContentCtx: contentCtx,
      miniMapBase,
      miniMapBaseReady: true,
      // tileCount matches (tile count never changes when a waystation is captured in place) --
      // only tilesRevision differs from the last draw, same as the real client-map-facade wiring.
      miniMapLast: { camX: 10, camY: 10, zoom: 1, replayIndex: -1, tileCount: tiles.size, tilesRevision: lastTilesRevision },
      contentCache: { computedAt: 0 },
      parseKey: (key) => {
        const parts = key.split(",").map(Number);
        return { x: parts[0] ?? 0, y: parts[1] ?? 0 };
      },
      keyFor: (x, y) => `${x},${y}`,
      tileVisibilityStateAt: () => "visible",
      effectiveOverlayColor: () => "#ffffff",
      isDockRouteVisibleForPlayer: () => false,
      hasCollectableYield: () => false,
      replayCurrentEvent: () => undefined
    });
    return contentCtx;
  };

  it("draws a captured way station's dot in the dim color, not the bright dormant color", () => {
    const activatedTiles = new Map<string, Tile>([["10,10", waystationTile(true)]]);
    const activatedCtx = drawWaystationDot(activatedTiles, 2, 1);
    expect(activatedCtx.fillStyleAtFill).toContain("rgba(120, 150, 155, 0.7)");
    expect(activatedCtx.fillStyleAtFill).not.toContain("rgba(90, 220, 235, 0.95)");

    const dormantTiles = new Map<string, Tile>([["10,10", waystationTile(false)]]);
    const dormantCtx = drawWaystationDot(dormantTiles, 2, 1);
    expect(dormantCtx.fillStyleAtFill).toContain("rgba(90, 220, 235, 0.95)");
    expect(dormantCtx.fillStyleAtFill).not.toContain("rgba(120, 150, 155, 0.7)");
  });

  it("recomputes (content-dirty) purely from the waystation's own tilesRevision bump, with tile count unchanged", () => {
    const tiles = new Map<string, Tile>([["10,10", waystationTile(true)]]);
    const w = 64;
    const h = 64;
    const ctx = makeFakeCtx();
    const contentCtx = makeFakeCtx();
    const canvas = { width: 200, height: 200 } as HTMLCanvasElement;
    const miniMapEl = { width: w, height: h } as HTMLCanvasElement;
    const miniMapContentEl = { width: w, height: h } as HTMLCanvasElement;
    const miniMapBase = { width: w, height: h } as HTMLCanvasElement;
    const contentCache: MiniMapContentCache = { computedAt: 9_000, box: { x0: 0, y0: 0, w: 450, h: 450 } };

    const changed = drawMiniMap({
      nowMs: 9_500,
      state: {
        camX: 10,
        camY: 10,
        zoom: 1,
        replayActive: false,
        replayIndex: 0,
        replayOwnershipByTile: new Map(),
        fogDisabled: true,
        tiles,
        dockPairs: [],
        shardRainPingsByTile: new Map(),
        shardRainStatus: undefined,
        tilesRevision: 2
      },
      canvas,
      miniMapEl,
      miniMapCtx: ctx,
      miniMapContentEl,
      miniMapContentCtx: contentCtx,
      miniMapBase,
      miniMapBaseReady: true,
      miniMapLast: { camX: 10, camY: 10, zoom: 1, replayIndex: 0, tileCount: tiles.size, tilesRevision: 1 },
      contentCache,
      parseKey: (key) => {
        const parts = key.split(",").map(Number);
        return { x: parts[0] ?? 0, y: parts[1] ?? 0 };
      },
      keyFor: (x, y) => `${x},${y}`,
      tileVisibilityStateAt: () => "visible",
      effectiveOverlayColor: () => "#ffffff",
      isDockRouteVisibleForPlayer: () => false,
      hasCollectableYield: () => false,
      replayCurrentEvent: () => undefined
    });

    expect(changed).toBe(true);
    expect(contentCache.computedAt).toBe(9_500); // the content layer actually recomputed
  });
});
