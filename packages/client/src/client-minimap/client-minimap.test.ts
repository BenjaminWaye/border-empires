import { beforeAll, describe, expect, it } from "vitest";
import { WORLD_WIDTH } from "@border-empires/shared";
import { isDockRouteVisibleForPlayer } from "../client-dock-routes.js";
import type { DockPair, Tile } from "../client-types.js";
import { makeFakeCtx } from "./client-minimap.test-helpers.js";

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
    hasManufactory: false,
    manufactoryActive: false,
    hasIncubationEngine: false,
    incubationEngineActive: false,
  }
});

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
        tilesRevision: 0
      },
      canvas,
      miniMapEl,
      miniMapCtx: ctx,
      miniMapContentEl,
      miniMapContentCtx: contentCtx,
      miniMapBase,
      miniMapBaseReady: true,
      miniMapLast: { camX: -1, camY: -1, zoom: -1, replayIndex: -1, tileCount: -1, tilesRevision: -1 },
      contentCache: { computedAt: 0 },
      parseKey: (key) => {
        const parts = key.split(",").map(Number);
        return { x: parts[0] ?? 0, y: parts[1] ?? 0 };
      },
      keyFor: (x, y) => `${x},${y}`,
      // Left half of each row is unexplored, right half visible: one fog run per row.
      // World is WORLD_WIDTH tiles wide mapped onto an 8px canvas, so px 0-3
      // land in the left half.
      tileVisibilityStateAt: (x) => (x < WORLD_WIDTH / 2 ? "unexplored" : "visible"),
      effectiveOverlayColor: () => "#ffffff",
      isDockRouteVisibleForPlayer: () => false,
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

const drawMiniMapWithTiles = (
  contentCtx: ReturnType<typeof makeFakeCtx>,
  tiles: Map<string, Tile>,
  docks?: { pairs: DockPair[]; visible: (pair: DockPair) => boolean }
): void => {
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
      dockPairs: docks?.pairs ?? [],
      tilesRevision: 0
    },
    canvas,
    miniMapEl,
    miniMapCtx: ctx,
    miniMapContentEl,
    miniMapContentCtx: contentCtx,
    miniMapBase,
    miniMapBaseReady: true,
    miniMapLast: { camX: -1, camY: -1, zoom: -1, replayIndex: -1, tileCount: -1, tilesRevision: -1 },
    contentCache: { computedAt: 0 },
    parseKey: (key) => {
      const parts = key.split(",").map(Number);
      return { x: parts[0] ?? 0, y: parts[1] ?? 0 };
    },
    keyFor: (x, y) => `${x},${y}`,
    tileVisibilityStateAt: () => "visible",
    effectiveOverlayColor: () => "#3366cc",
    isDockRouteVisibleForPlayer: docks?.visible ?? (() => false),
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

describe("miniMapTownMarkerPalette", () => {
  it("does not use a red warning outer marker for unfed towns", () => {
    const fed = miniMapTownMarkerPalette(townTile(true));
    const unfed = miniMapTownMarkerPalette(townTile(false));
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


describe("dock destination minimap discovery", () => {
  it("keeps hidden links dark on selection and lights them after authoritative discovery", () => {
    const pair = { ax: 10, ay: 10, bx: 12, by: 10 };
    const tiles = new Map([["10,10", ownershipTile({ dockId: "a", ownerId: "enemy", ownershipState: "SETTLED" })]]);
    const deps = {
      fogDisabled: false, selected: { x: 10, y: 10 }, discoveredDockTiles: new Set(["10,10"]),
      keyFor: (x: number, y: number): string => `${x},${y}`
    };
    const docks = { pairs: [pair], visible: (route: DockPair) => isDockRouteVisibleForPlayer(route, deps) };
    const before = makeFakeCtx();
    drawMiniMapWithTiles(before, tiles, docks);
    expect(before.fillRectCalls.filter((call) => call.style === "rgba(127, 238, 255, 0.9)")).toHaveLength(0);

    tiles.set("10,10", ownershipTile({ dockId: "a", ownerId: "me", ownershipState: "SETTLED" }));
    tiles.set("12,10", ownershipTile({ x: 12, dockId: "b" }));
    deps.discoveredDockTiles.add("12,10");
    const after = makeFakeCtx();
    drawMiniMapWithTiles(after, tiles, docks);
    expect(after.fillRectCalls.filter((call) => call.style === "rgba(127, 238, 255, 0.9)")).toHaveLength(2);
  });
});
