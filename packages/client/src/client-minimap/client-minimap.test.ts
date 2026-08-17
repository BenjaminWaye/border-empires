import { beforeAll, describe, expect, it } from "vitest";
import type { Tile } from "../client-types.js";
import type { MiniMapContentCache } from "./client-minimap.js";

let miniMapTownMarkerPalette: typeof import("./client-minimap.js").miniMapTownMarkerPalette;
let miniMapEdgeArrowPoint: typeof import("./client-minimap.js").miniMapEdgeArrowPoint;
let drawMiniMap: typeof import("./client-minimap.js").drawMiniMap;
let hexWithAlpha: typeof import("../client-map-render/client-map-render.js").hexWithAlpha;

beforeAll(async () => {
  class MockImage {
    decoding = "";
    src = "";
  }
  Object.assign(globalThis, { Image: MockImage });
  ({ miniMapTownMarkerPalette, miniMapEdgeArrowPoint, drawMiniMap } = await import("./client-minimap.js"));
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

const makeFakeCtx = (): CanvasRenderingContext2D & {
  fillRectCalls: Array<{ x: number; y: number; w: number; h: number; style: string }>;
  arcCalls: Array<{ x: number; y: number }>;
  translateCalls: Array<{ x: number; y: number }>;
} => {
  const calls: Array<{ x: number; y: number; w: number; h: number; style: string }> = [];
  const arcCalls: Array<{ x: number; y: number }> = [];
  const translateCalls: Array<{ x: number; y: number }> = [];
  let fillStyle = "#000000";
  const ctx = {
    fillRectCalls: calls,
    arcCalls,
    translateCalls,
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
    arc: (x: number, y: number) => {
      arcCalls.push({ x, y });
    },
    fill: () => {},
    stroke: () => {},
    fillText: () => {},
    save: () => {},
    restore: () => {},
    translate: (x: number, y: number) => {
      translateCalls.push({ x, y });
    },
    rotate: () => {},
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
    strokeStyle: "",
    lineWidth: 1,
    textAlign: "center",
    textBaseline: "middle",
    font: "",
    imageSmoothingEnabled: false
  };
  return ctx as unknown as CanvasRenderingContext2D & { fillRectCalls: typeof calls; arcCalls: typeof arcCalls; translateCalls: typeof translateCalls };
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
        shardRainPingsByTile: new Map(),
        shardRainStatus: undefined
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
      shardRainPingsByTile: new Map(),
      shardRainStatus: undefined
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
        shardRainPingsByTile: new Map(),
        shardRainStatus: undefined
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

describe("miniMapEdgeArrowPoint", () => {
  it("clamps a point outside the canvas onto its border, inset by the margin", () => {
    // Straight east of a 100x100 canvas's center (50,50): clamped to the right edge.
    const arrow = miniMapEdgeArrowPoint(500, 50, 100, 100, 8);
    expect(arrow.x).toBeCloseTo(92, 5);
    expect(arrow.y).toBeCloseTo(50, 5);
    expect(arrow.angle).toBeCloseTo(0, 5);
  });

  it("picks the tighter of the two axis constraints for an off-diagonal target", () => {
    // Far more east than south of center: clamped by the right edge, not the bottom edge.
    const arrow = miniMapEdgeArrowPoint(1000, 60, 100, 100, 0);
    expect(arrow.x).toBeCloseTo(100, 5);
    expect(arrow.y).toBeLessThan(60);
  });

  it("returns the canvas center for a target exactly at the center", () => {
    expect(miniMapEdgeArrowPoint(50, 50, 100, 100)).toEqual({ x: 50, y: 50, angle: 0 });
  });
});

describe("drawMiniMap shard rain ping rendering", () => {
  const drawWithPing = (args: {
    ping: { x: number; y: number; createdAt: number; activateAt: number };
    fogDisabled: boolean;
    tiles?: Map<string, Tile>;
  }): ReturnType<typeof makeFakeCtx> => {
    const w = 100;
    const h = 100;
    const contentCtx = makeFakeCtx();
    const canvas = { width: 200, height: 200 } as HTMLCanvasElement;
    const miniMapEl = { width: w, height: h } as HTMLCanvasElement;
    const miniMapContentEl = { width: w, height: h } as HTMLCanvasElement;
    const miniMapBase = { width: w, height: h } as HTMLCanvasElement;

    drawMiniMap({
      nowMs: 0,
      state: {
        camX: 5,
        camY: 5,
        zoom: 1,
        replayActive: false,
        replayIndex: 0,
        replayOwnershipByTile: new Map(),
        fogDisabled: args.fogDisabled,
        tiles: args.tiles ?? new Map(),
        dockPairs: [],
        shardRainPingsByTile: new Map([[`${args.ping.x},${args.ping.y}`, args.ping]]),
        shardRainStatus: { key: "rain", phase: "started", startsAt: -1, expiresAt: 60_000, siteCount: 1 }
      },
      canvas,
      miniMapEl,
      miniMapCtx: makeFakeCtx(),
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
      effectiveOverlayColor: () => "#ffffff",
      isDockRouteVisibleForPlayer: () => false,
      hasCollectableYield: () => false,
      replayCurrentEvent: () => undefined
    });
    return contentCtx;
  };

  it("draws a pulsing ring for an active ping inside the (fog-disabled, full-world) view box", () => {
    // Fog disabled -> the view box is the full 450x450 world, so any world tile is in-box.
    const contentCtx = drawWithPing({ ping: { x: 225, y: 225, createdAt: 0, activateAt: 0 }, fogDisabled: true });
    expect(contentCtx.arcCalls.length).toBeGreaterThan(0);
    expect(contentCtx.translateCalls).toHaveLength(0);
  });

  it("draws nothing for a ping that has not activated yet", () => {
    const contentCtx = drawWithPing({ ping: { x: 225, y: 225, createdAt: 0, activateAt: 60_000 }, fogDisabled: true });
    expect(contentCtx.arcCalls).toHaveLength(0);
    expect(contentCtx.translateCalls).toHaveLength(0);
  });

  it("draws an edge arrow instead of a ring for an active ping far outside the explored-territory view box", () => {
    // A single explored tile near the origin shrinks the view box to roughly (0,0)-(50,50);
    // a ping at (400,400) falls well outside it.
    const tiles = new Map<string, Tile>([["5,5", { x: 5, y: 5, terrain: "LAND" }]]);
    const contentCtx = drawWithPing({ ping: { x: 400, y: 400, createdAt: 0, activateAt: 0 }, fogDisabled: false, tiles });
    expect(contentCtx.arcCalls).toHaveLength(0);
    expect(contentCtx.translateCalls).toHaveLength(1);
    // Clamped near the bottom-right corner of the 100x100 canvas, not off in space at the raw ping position.
    expect(contentCtx.translateCalls[0]!.x).toBeLessThanOrEqual(100);
    expect(contentCtx.translateCalls[0]!.y).toBeLessThanOrEqual(100);
  });

  it("points the arrow the short way around the toroidal world instead of the long raw-coordinate way", () => {
    // Explored territory sits near the world's east edge (x=440 of 450); the view box ends up
    // roughly x:[400,450). A ping at x=10 is only ~20 tiles away going east across the world
    // seam, but ~390 tiles away in raw (non-wrapping) coordinates.
    const tiles = new Map<string, Tile>([["440,5", { x: 440, y: 5, terrain: "LAND" }]]);
    const contentCtx = drawWithPing({ ping: { x: 10, y: 5, createdAt: 0, activateAt: 0 }, fogDisabled: false, tiles });
    expect(contentCtx.translateCalls).toHaveLength(1);
    // The short way is east: the arrow should clamp to the canvas's right edge (x close to
    // 100), not the left edge (x close to 0) that the raw, non-wrapping pixel position would
    // clamp to.
    expect(contentCtx.translateCalls[0]!.x).toBeGreaterThan(50);
  });
});
