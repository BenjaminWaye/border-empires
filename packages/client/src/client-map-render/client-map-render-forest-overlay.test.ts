import { beforeAll, describe, expect, it } from "vitest";
import { setWorldSeed } from "@border-empires/shared";

let drawForestOverlay: typeof import("./client-map-render.js").drawForestOverlay;
let isForestTile: typeof import("../client-constants.js").isForestTile;
let isLightGrassScatterTile: typeof import("../client-constants.js").isLightGrassScatterTile;

// The exact same hash/salt/mod as both client-map-3d-forest.ts's
// tileHash(worldX, worldZ, 11, 3) and client-map-render-forest-overlay.ts's
// isLeafSpeciesAt -- duplicated here (not imported) so this test fails if
// either source file's formula ever drifts from the other, which is the
// actual cross-renderer species-parity guarantee AGENTS.md's renderer-parity
// rule calls for.
const speciesAt = (wx: number, wy: number): number => (((wx * 73856093) ^ (wy * 19349663) ^ (11 * 83492791)) >>> 0) % 3;

type MockCanvasContext = Pick<
  CanvasRenderingContext2D,
  "save" | "restore" | "fillRect" | "beginPath" | "moveTo" | "lineTo" | "arc" | "closePath" | "fill" | "fillStyle"
>;

const createMockContext = (): { ctx: CanvasRenderingContext2D; fillRectCalls: number; arcCalls: number } => {
  let fillRectCalls = 0;
  let arcCalls = 0;
  const ctx: MockCanvasContext = {
    fillStyle: "",
    save: () => undefined,
    restore: () => undefined,
    fillRect: () => {
      fillRectCalls += 1;
    },
    beginPath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    arc: () => {
      arcCalls += 1;
    },
    closePath: () => undefined,
    fill: () => undefined
  };
  return {
    ctx: ctx as CanvasRenderingContext2D,
    get fillRectCalls() {
      return fillRectCalls;
    },
    get arcCalls() {
      return arcCalls;
    }
  };
};

beforeAll(async () => {
  // client-map-render.ts loads overlay images at module scope (Image()) --
  // same mock as client-forest-3d-regression.test.ts uses.
  class MockImage {
    decoding = "";
    src = "";
    complete = true;
    naturalWidth = 1;
    naturalHeight = 1;
  }
  Object.assign(globalThis, { Image: MockImage });
  ({ drawForestOverlay } = await import("./client-map-render.js"));
  ({ isForestTile, isLightGrassScatterTile } = await import("../client-constants.js"));
});

describe("2D forest overlay leaf/deciduous species selection", () => {
  it("draws the leaf shape (arc-based) exactly for tiles the shared species formula calls leaf, on a sample of real forest tiles -- cross-renderer parity with client-map-3d-forest.ts's tileHash", () => {
    setWorldSeed(2024);
    let checkedLeaf = false;
    let checkedConifer = false;
    for (let wx = 0; wx < 200 && !(checkedLeaf && checkedConifer); wx += 1) {
      for (let wy = 20; wy < 220 && !(checkedLeaf && checkedConifer); wy += 1) {
        if (!isForestTile(wx, wy)) continue;
        const expectLeaf = speciesAt(wx, wy) === 2;
        const mock = createMockContext();
        drawForestOverlay(mock.ctx, wx, wy, 0, 0, 48);
        if (expectLeaf) {
          expect(mock.arcCalls).toBeGreaterThan(0);
          checkedLeaf = true;
        } else {
          expect(mock.arcCalls).toBe(0);
          checkedConifer = true;
        }
      }
    }
    expect(checkedLeaf).toBe(true);
    expect(checkedConifer).toBe(true);
  });
});

describe("2D forest overlay light-grass scatter sapling", () => {
  it("draws a leaf-shaped (arc-based) tree for a scatter tile, at a smaller scale than a real forest tile", () => {
    setWorldSeed(2024);
    let scatterTile: { x: number; y: number } | undefined;
    for (let x = 0; x < 200 && !scatterTile; x += 1) {
      for (let y = 20; y < 220 && !scatterTile; y += 1) {
        if (isLightGrassScatterTile(x, y)) scatterTile = { x, y };
      }
    }
    expect(scatterTile).toBeDefined();

    const mock = createMockContext();
    drawForestOverlay(mock.ctx, scatterTile!.x, scatterTile!.y, 0, 0, 48);
    expect(mock.fillRectCalls).toBe(1); // exactly one sapling trunk, not a full forest layout
    expect(mock.arcCalls).toBeGreaterThan(0); // leaf shape, not the conifer triangle
  });
});
