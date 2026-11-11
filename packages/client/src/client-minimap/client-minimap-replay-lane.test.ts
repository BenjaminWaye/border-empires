import { describe, expect, it, vi } from "vitest";
import type { Tile } from "../client-types.js";
import { computeMiniMapViewBox } from "./client-minimap-view-box.js";
import { makeFakeCtx } from "./client-minimap.test-helpers.js";

const laneCalls: number[][] = [];
vi.mock("../client-map-render/client-map-render.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../client-map-render/client-map-render.js")>();
  return {
    ...real,
    drawAetherBridgeLane: (_ctx: unknown, fromX: number, fromY: number, toX: number, toY: number) => {
      laneCalls.push([fromX, fromY, toX, toY]);
    }
  };
});

describe("minimap replay bridge lane", () => {
  it("draws a lane whose end lies just outside the frame from that side, not the long way round the world", async () => {
    Object.assign(globalThis, { Image: class { decoding = ""; src = ""; } });
    const { drawMiniMap } = await import("./client-minimap.js");
    const tiles = new Map<string, Tile>();
    for (let x = 100; x <= 200; x += 1) tiles.set(`${x},150`, { x, y: 150, terrain: "LAND" });
    const w = 220;
    const box = computeMiniMapViewBox({ tiles, fogDisabled: false, canvasW: w, canvasH: w });
    const from = { x: Math.floor(box.x0) - 2, y: 150 };
    const to = { x: Math.floor(box.x0) + 20, y: 150 };
    const ctx = makeFakeCtx();
    drawMiniMap({
      nowMs: 10_000,
      state: {
        camX: 150, camY: 150, zoom: 10, replayActive: true, replayIndex: 1, replayOwnershipByTile: new Map(),
        fogDisabled: false, tiles, dockPairs: [], tilesRevision: 0
      },
      canvas: { width: 200, height: 200 } as HTMLCanvasElement,
      miniMapEl: { width: w, height: w } as HTMLCanvasElement,
      miniMapCtx: ctx,
      miniMapContentEl: { width: w, height: w } as HTMLCanvasElement,
      miniMapContentCtx: makeFakeCtx(),
      miniMapBase: { width: 640, height: 320 } as HTMLCanvasElement,
      miniMapBaseReady: true,
      miniMapLast: { camX: -1, camY: -1, zoom: -1, replayIndex: -1, tileCount: -1, tilesRevision: -1 },
      contentCache: { computedAt: 0 },
      parseKey: (key) => ({ x: Number(key.split(",")[0]), y: Number(key.split(",")[1]) }),
      keyFor: (x, y) => `${x},${y}`,
      tileVisibilityStateAt: () => "visible",
      effectiveOverlayColor: () => "#3366cc",
      isDockRouteVisibleForPlayer: () => false,
      replayCurrentEvent: () => ({ from, to } as unknown as ReturnType<Parameters<typeof drawMiniMap>[0]["replayCurrentEvent"]>)
    });
    expect(laneCalls).toHaveLength(1);
    const [fromPx, , toPx] = laneCalls[0]!;
    // The outside end sits just left of the frame, a few pixels from the near end, not far off the right side.
    expect(fromPx).toBeLessThan(0);
    expect(fromPx).toBeGreaterThan(-w / 4);
    expect(toPx - fromPx).toBeGreaterThan(0);
    expect(toPx - fromPx).toBeLessThan(w / 2);
  });
});
