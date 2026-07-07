import { afterEach, beforeAll, describe, expect, it } from "vitest";

let drawForestOverlay: typeof import("../client-map-render/client-map-render.js").drawForestOverlay;
let setTrue3DRendererActive: typeof import("../client-renderer-mode.js").setTrue3DRendererActive;
let forestConstants: typeof import("../client-constants.js");
let setWorldSeed: typeof import("@border-empires/shared").setWorldSeed;

type MockCanvasContext = Pick<
  CanvasRenderingContext2D,
  "save" | "restore" | "fillRect" | "beginPath" | "moveTo" | "lineTo" | "closePath" | "fill" | "fillStyle"
>;

const createMockContext = (): { ctx: CanvasRenderingContext2D; fillRectCalls: number; fillCalls: number } => {
  let fillRectCalls = 0;
  let fillCalls = 0;
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
    closePath: () => undefined,
    fill: () => {
      fillCalls += 1;
    }
  };
  return {
    ctx: ctx as CanvasRenderingContext2D,
    get fillRectCalls() {
      return fillRectCalls;
    },
    get fillCalls() {
      return fillCalls;
    }
  };
};

const seededForestTile = { x: 24, y: 15 };

beforeAll(async () => {
  class MockImage {
    decoding = "";
    src = "";
    complete = true;
    naturalWidth = 1;
    naturalHeight = 1;
  }
  Object.assign(globalThis, { Image: MockImage });
  ({ setWorldSeed } = await import("@border-empires/shared"));
  setWorldSeed(1);
  ({ drawForestOverlay } = await import("../client-map-render/client-map-render.js"));
  ({ setTrue3DRendererActive } = await import("../client-renderer-mode.js"));
  forestConstants = await import("../client-constants.js");
  expect(forestConstants.isForestTile(seededForestTile.x, seededForestTile.y)).toBe(true);
});

afterEach(() => {
  setTrue3DRendererActive(false);
});

describe("3d forest rendering regression guard", () => {
  it("draws the legacy forest overlay for forest tiles while true 3d is disabled", () => {
    const mock = createMockContext();

    setTrue3DRendererActive(false);
    drawForestOverlay(mock.ctx, seededForestTile.x, seededForestTile.y, 0, 0, 48);

    expect(mock.fillRectCalls).toBeGreaterThan(0);
    expect(mock.fillCalls).toBeGreaterThan(0);
  });

  it("skips the legacy forest overlay entirely while the true 3d renderer is active", () => {
    const mock = createMockContext();

    setTrue3DRendererActive(true);
    drawForestOverlay(mock.ctx, seededForestTile.x, seededForestTile.y, 0, 0, 48);

    expect(mock.fillRectCalls).toBe(0);
    expect(mock.fillCalls).toBe(0);
  });
});
