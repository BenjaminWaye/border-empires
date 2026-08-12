import { beforeAll, describe, expect, it } from "vitest";
import type { Tile } from "../client-types.js";
import type { MiniMapContentCache } from "./client-minimap.js";

let miniMapTownMarkerPalette: typeof import("./client-minimap.js").miniMapTownMarkerPalette;
let drawMiniMap: typeof import("./client-minimap.js").drawMiniMap;
let hexWithAlpha: typeof import("../client-map-render/client-map-render.js").hexWithAlpha;

beforeAll(async () => {
  class MockImage {
    decoding = "";
    src = "";
  }
  Object.assign(globalThis, { Image: MockImage });
  ({ miniMapTownMarkerPalette, drawMiniMap } = await import("./client-minimap.js"));
  ({ hexWithAlpha } = await import("../client-map-render/client-map-render.js"));
});

const townTile = (isFed: boolean): Tile => ({
  x: 1,
  y: 1,
  terrain: "LAND",
  ownershipState: "SETTLED",
  ownerId: "me",
  town: {
    type: "MARKET",
    baseGoldPerMinute: 2,
    supportCurrent: 1,
    supportMax: 1,
    goldPerMinute: 2,
    cap: 100,
    isFed,
    population: 20_000,
    maxPopulation: 100_000,
    populationTier: "TOWN",
    connectedTownCount: 0,
    connectedTownBonus: 0,
    hasMintworks: false,
    mintworksActive: false,
    hasGranary: false,
    granaryActive: false,
  }
});

const makeFakeCtx = (): CanvasRenderingContext2D & { fillRectCalls: Array<{ x: number; y: number; w: number; h: number; style: string }> } => {
  const calls: Array<{ x: number; y: number; w: number; h: number; style: string }> = [];
  let fillStyle = "#000000";
  const ctx = {
    fillRectCalls: calls,
    get fillStyle(): string {
      return fillStyle;
    },
    set fillStyle(v: string) {
      fillStyle = v;
    },
    fillRect: (x: number, y: number, w: number, h: number) => {
      calls.push({ x, y, w, h, style: fillStyle });
    },
    clearRect: () => {},
    drawImage: () => {},
    strokeRect: () => {},
    beginPath: () => {},
    arc: () => {},
    fill: () => {},
    stroke: () => {},
    fillText: () => {},
    save: () => {},
    restore: () => {},
    strokeStyle: "",
    lineWidth: 1,
    textAlign: "center",
    textBaseline: "middle",
    font: "",
    imageSmoothingEnabled: false
  };
  return ctx as unknown as CanvasRenderingContext2D & { fillRectCalls: typeof calls };
};

describe("drawMiniMap fog rendering", () => {
  it("merges same-visibility fog runs into one fillRect per run instead of per pixel", () => {
    const w = 8;
    const h = 4;
    const ctx = makeFakeCtx();
    const contentCtx = makeFakeCtx();
    const canvas = { width: 200, height: 200 } as HTMLCanvasElement;
    const miniMapEl = { width: w, height: h } as HTMLCanvasElement;
    const miniMapContentEl = { width: w, height: h } as HTMLCanvasElement;
    const miniMapBase = { width: w, height: h } as HTMLCanvasElement;

    drawMiniMap({
      nowMs: 10_000,
      state: {
        camX: 5,
        camY: 5,
        zoom: 1,
        replayActive: false,
        replayIndex: 0,
        replayOwnershipByTile: new Map(),
        fogDisabled: false,
        tiles: new Map(),
        dockPairs: [],
        shardRainPingsByTile: new Map()
      },
      canvas,
      miniMapEl,
      miniMapCtx: ctx,
      miniMapContentEl,
      miniMapContentCtx: contentCtx,
      miniMapBase,
      miniMapBaseReady: true,
      miniMapLast: { camX: -1, camY: -1, zoom: -1, replayIndex: -1, tileCount: -1 },
      contentCache: { computedAt: 0 },
      parseKey: (key) => {
        const parts = key.split(",").map(Number);
        return { x: parts[0] ?? 0, y: parts[1] ?? 0 };
      },
      keyFor: (x, y) => `${x},${y}`,
      // Left half of each row is unexplored, right half visible: one fog run per row.
      // World is 450 tiles wide mapped onto an 8px canvas, so px 0-3 -> wx 0-224.
      tileVisibilityStateAt: (x) => (x < 225 ? "unexplored" : "visible"),
      effectiveOverlayColor: () => "#ffffff",
      isDockRouteVisibleForPlayer: () => false,
      hasCollectableYield: () => false,
      replayCurrentEvent: () => undefined
    });

    // Fog is part of the cached content layer, not the visible composite ctx.
    const fogCalls = contentCtx.fillRectCalls.filter((c) => c.style === "#000000");
    expect(fogCalls).toHaveLength(h);
    for (const call of fogCalls) {
      expect(call.w).toBe(w / 2);
      expect(call.h).toBe(1);
    }
  });
});

const ownershipTile = (overrides: Partial<Tile>): Tile => ({
  x: 10,
  y: 10,
  terrain: "LAND",
  ...overrides
});

const drawMiniMapWithTiles = (contentCtx: ReturnType<typeof makeFakeCtx>, tiles: Map<string, Tile>): void => {
  const w = 64;
  const h = 64;
  const ctx = makeFakeCtx();
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
      fogDisabled: false,
      tiles,
      dockPairs: [],
      shardRainPingsByTile: new Map()
    },
    canvas,
    miniMapEl,
    miniMapCtx: ctx,
    miniMapContentEl,
    miniMapContentCtx: contentCtx,
    miniMapBase,
    miniMapBaseReady: true,
    miniMapLast: { camX: -1, camY: -1, zoom: -1, replayIndex: -1, tileCount: -1 },
    contentCache: { computedAt: 0 },
    parseKey: (key) => {
      const parts = key.split(",").map(Number);
      return { x: parts[0] ?? 0, y: parts[1] ?? 0 };
    },
    keyFor: (x, y) => `${x},${y}`,
    tileVisibilityStateAt: () => "visible",
    effectiveOverlayColor: () => "#3366cc",
    isDockRouteVisibleForPlayer: () => false,
    hasCollectableYield: () => false,
    replayCurrentEvent: () => undefined
  });
};

describe("drawMiniMap live ownership tint", () => {
  it("tints a settled owned tile with the owner color at high alpha", () => {
    const contentCtx = makeFakeCtx();
    const tile = ownershipTile({ ownerId: "p1", ownershipState: "SETTLED" });
    drawMiniMapWithTiles(contentCtx, new Map([["10,10", tile]]));

    const expectedStyle = hexWithAlpha("#3366cc", 0.9);
    const ownerCalls = contentCtx.fillRectCalls.filter((c) => c.style === expectedStyle && c.w === 1 && c.h === 1);
    expect(ownerCalls.length).toBeGreaterThan(0);
  });

  it("tints a frontier owned tile with the owner color at lower alpha", () => {
    const contentCtx = makeFakeCtx();
    const tile = ownershipTile({ ownerId: "p1", ownershipState: "FRONTIER" });
    drawMiniMapWithTiles(contentCtx, new Map([["10,10", tile]]));

    const expectedStyle = hexWithAlpha("#3366cc", 0.6);
    const ownerCalls = contentCtx.fillRectCalls.filter((c) => c.style === expectedStyle && c.w === 1 && c.h === 1);
    expect(ownerCalls.length).toBeGreaterThan(0);
  });

  it("does not tint a fogged owned tile", () => {
    const contentCtx = makeFakeCtx();
    const tile = ownershipTile({ ownerId: "p1", ownershipState: "SETTLED", fogged: true });
    drawMiniMapWithTiles(contentCtx, new Map([["10,10", tile]]));

    const settledStyle = hexWithAlpha("#3366cc", 0.9);
    const frontierStyle = hexWithAlpha("#3366cc", 0.6);
    const ownerCalls = contentCtx.fillRectCalls.filter((c) => c.style === settledStyle || c.style === frontierStyle);
    expect(ownerCalls).toHaveLength(0);
  });

  it("does not tint an unowned tile", () => {
    const contentCtx = makeFakeCtx();
    const tile = ownershipTile({});
    drawMiniMapWithTiles(contentCtx, new Map([["10,10", tile]]));

    const settledStyle = hexWithAlpha("#3366cc", 0.9);
    const frontierStyle = hexWithAlpha("#3366cc", 0.6);
    const ownerCalls = contentCtx.fillRectCalls.filter((c) => c.style === settledStyle || c.style === frontierStyle);
    expect(ownerCalls).toHaveLength(0);
  });
});

describe("drawMiniMap content-layer recompute throttle", () => {
  const baseCall = (overrides: {
    tileCount: number;
    nowMs: number;
    contentCache: MiniMapContentCache;
    camX?: number;
    camY?: number;
    zoom?: number;
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
        shardRainPingsByTile: new Map()
      },
      canvas,
      miniMapEl,
      miniMapCtx: ctx,
      miniMapContentEl,
      miniMapContentCtx: contentCtx,
      miniMapBase,
      miniMapBaseReady: true,
      miniMapLast: { camX: 5, camY: 5, zoom: 1, replayIndex: 0, tileCount: overrides.tileCount },
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
});

describe("miniMapTownMarkerPalette", () => {
  it("does not use a red warning outer marker for unfed towns", () => {
    const fed = miniMapTownMarkerPalette(townTile(true), false);
    const unfed = miniMapTownMarkerPalette(townTile(false), false);
    expect(unfed.outer).toBe(fed.outer);
    expect(unfed.outer).toBe("rgba(6, 10, 18, 0.86)");
  });
});
