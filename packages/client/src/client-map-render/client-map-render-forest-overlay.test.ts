import { beforeAll, describe, expect, it } from "vitest";
import { setWorldSeed } from "@border-empires/shared";

// The 2D-canvas forest overlay's leaf/deciduous species selection reuses
// overlayVariantIndexAt(wx, wy, 3) (variant 2 = leaf, see
// client-map-render-forest-overlay.ts) so it's deterministic per world tile
// and mirrors the true-3D renderer's per-tile species hash in spirit. This
// asserts the 3-way split actually reaches all three variants across a
// sample of tiles, not just 0/1 -- i.e. the leaf variant is reachable at all.
let overlayVariantIndexAt: typeof import("./client-map-render.js").overlayVariantIndexAt;
let drawForestOverlay: typeof import("./client-map-render.js").drawForestOverlay;
let isLightGrassScatterTile: typeof import("../client-constants.js").isLightGrassScatterTile;

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
  ({ overlayVariantIndexAt, drawForestOverlay } = await import("./client-map-render.js"));
  ({ isLightGrassScatterTile } = await import("../client-constants.js"));
});

describe("2D forest overlay leaf/deciduous species selection", () => {
  it("reaches all three species variants (pine, spruce, leaf) across a sample of world tiles", () => {
    const variants = new Set<number>();
    for (let wx = 0; wx < 64; wx += 1) {
      for (let wy = 0; wy < 64; wy += 1) {
        variants.add(overlayVariantIndexAt(wx, wy, 3));
      }
    }
    expect(variants).toEqual(new Set([0, 1, 2]));
  });

  it("is deterministic for a given world tile", () => {
    expect(overlayVariantIndexAt(17, 42, 3)).toBe(overlayVariantIndexAt(17, 42, 3));
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
