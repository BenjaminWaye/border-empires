import { beforeAll, describe, expect, it } from "vitest";
import type { Tile } from "../client-types.js";

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
    hasMarket: false,
    marketActive: false,
    hasGranary: false,
    granaryActive: false,
    hasBank: false,
    bankActive: false
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
    const canvas = { width: 200, height: 200 } as HTMLCanvasElement;
    const miniMapEl = { width: w, height: h } as HTMLCanvasElement;
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
      miniMapBase,
      miniMapBaseReady: true,
      miniMapLast: { camX: -1, camY: -1, zoom: -1, replayIndex: -1, tileCount: -1, drawAt: 0 },
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

    const fogCalls = ctx.fillRectCalls.filter((c) => c.style === "#000000");
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

const drawMiniMapWithTiles = (ctx: ReturnType<typeof makeFakeCtx>, tiles: Map<string, Tile>): void => {
  const w = 64;
  const h = 64;
  const canvas = { width: 200, height: 200 } as HTMLCanvasElement;
  const miniMapEl = { width: w, height: h } as HTMLCanvasElement;
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
    miniMapBase,
    miniMapBaseReady: true,
    miniMapLast: { camX: -1, camY: -1, zoom: -1, replayIndex: -1, tileCount: -1, drawAt: 0 },
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
    const ctx = makeFakeCtx();
    const tile = ownershipTile({ ownerId: "p1", ownershipState: "SETTLED" });
    drawMiniMapWithTiles(ctx, new Map([["10,10", tile]]));

    const expectedStyle = hexWithAlpha("#3366cc", 0.9);
    const ownerCalls = ctx.fillRectCalls.filter((c) => c.style === expectedStyle && c.w === 1 && c.h === 1);
    expect(ownerCalls.length).toBeGreaterThan(0);
  });

  it("tints a frontier owned tile with the owner color at lower alpha", () => {
    const ctx = makeFakeCtx();
    const tile = ownershipTile({ ownerId: "p1", ownershipState: "FRONTIER" });
    drawMiniMapWithTiles(ctx, new Map([["10,10", tile]]));

    const expectedStyle = hexWithAlpha("#3366cc", 0.6);
    const ownerCalls = ctx.fillRectCalls.filter((c) => c.style === expectedStyle && c.w === 1 && c.h === 1);
    expect(ownerCalls.length).toBeGreaterThan(0);
  });

  it("does not tint a fogged owned tile", () => {
    const ctx = makeFakeCtx();
    const tile = ownershipTile({ ownerId: "p1", ownershipState: "SETTLED", fogged: true });
    drawMiniMapWithTiles(ctx, new Map([["10,10", tile]]));

    const settledStyle = hexWithAlpha("#3366cc", 0.9);
    const frontierStyle = hexWithAlpha("#3366cc", 0.6);
    const ownerCalls = ctx.fillRectCalls.filter((c) => c.style === settledStyle || c.style === frontierStyle);
    expect(ownerCalls).toHaveLength(0);
  });

  it("does not tint an unowned tile", () => {
    const ctx = makeFakeCtx();
    const tile = ownershipTile({});
    drawMiniMapWithTiles(ctx, new Map([["10,10", tile]]));

    const settledStyle = hexWithAlpha("#3366cc", 0.9);
    const frontierStyle = hexWithAlpha("#3366cc", 0.6);
    const ownerCalls = ctx.fillRectCalls.filter((c) => c.style === settledStyle || c.style === frontierStyle);
    expect(ownerCalls).toHaveLength(0);
  });
});

describe("drawMiniMap redraw throttle", () => {
  const baseCall = (overrides: {
    tileCount: number;
    drawAt: number;
    nowMs: number;
    camX?: number;
    camY?: number;
    zoom?: number;
  }): boolean => {
    const w = 8;
    const h = 8;
    const ctx = makeFakeCtx();
    const canvas = { width: 200, height: 200 } as HTMLCanvasElement;
    const miniMapEl = { width: w, height: h } as HTMLCanvasElement;
    const miniMapBase = { width: w, height: h } as HTMLCanvasElement;

    return drawMiniMap({
      nowMs: overrides.nowMs,
      state: {
        camX: overrides.camX ?? 5,
        camY: overrides.camY ?? 5,
        zoom: 1,
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
      miniMapBase,
      miniMapBaseReady: true,
      miniMapLast: { camX: 5, camY: 5, zoom: 1, replayIndex: 0, tileCount: overrides.tileCount, drawAt: overrides.drawAt },
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

  it("does not bypass the 140ms floor when only tile count changed (no camera move)", () => {
    // tileCount differs from state.tiles.size (0) but camera is unchanged and only 10ms elapsed:
    // a tile-discovery-only change must wait for the throttle, not redraw immediately.
    const changed = baseCall({ tileCount: 3, drawAt: 10_000, nowMs: 10_010 });
    expect(changed).toBe(false);
  });

  it("redraws once the 140ms floor has passed for a tile-count-only change", () => {
    const changed = baseCall({ tileCount: 3, drawAt: 10_000, nowMs: 10_141 });
    expect(changed).toBe(true);
  });

  it("still redraws immediately on a camera move regardless of elapsed time", () => {
    const changed = baseCall({ tileCount: 0, drawAt: 10_000, nowMs: 10_010, camX: 6 });
    expect(changed).toBe(true);
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
