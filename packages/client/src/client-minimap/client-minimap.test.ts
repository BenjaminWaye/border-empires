import { beforeAll, describe, expect, it } from "vitest";
import type { Tile } from "../client-types.js";

let miniMapTownMarkerPalette: typeof import("./client-minimap.js").miniMapTownMarkerPalette;
let drawMiniMap: typeof import("./client-minimap.js").drawMiniMap;

beforeAll(async () => {
  class MockImage {
    decoding = "";
    src = "";
  }
  Object.assign(globalThis, { Image: MockImage });
  ({ miniMapTownMarkerPalette, drawMiniMap } = await import("./client-minimap.js"));
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

describe("miniMapTownMarkerPalette", () => {
  it("does not use a red warning outer marker for unfed towns", () => {
    const fed = miniMapTownMarkerPalette(townTile(true), false);
    const unfed = miniMapTownMarkerPalette(townTile(false), false);
    expect(unfed.outer).toBe(fed.outer);
    expect(unfed.outer).toBe("rgba(6, 10, 18, 0.86)");
  });
});
