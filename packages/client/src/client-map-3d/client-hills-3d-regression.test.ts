import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

const clientSource = (filename: string): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, filename), "utf8");
};

let drawHillsOverlay: typeof import("../client-map-render-hills-overlay.js").drawHillsOverlay;
let setTrue3DRendererActive: typeof import("../client-renderer-mode.js").setTrue3DRendererActive;
let hillsConstants: typeof import("../client-constants.js");
let setWorldSeed: typeof import("@border-empires/shared").setWorldSeed;

type MockCanvasContext = Pick<
  CanvasRenderingContext2D,
  "save" | "restore" | "fillRect" | "beginPath" | "moveTo" | "quadraticCurveTo" | "closePath" | "fill" | "fillStyle" | "createLinearGradient"
>;

const createMockContext = (): { ctx: CanvasRenderingContext2D; fillCalls: number } => {
  let fillCalls = 0;
  const gradient = { addColorStop: () => undefined } as unknown as CanvasGradient;
  const ctx: MockCanvasContext = {
    fillStyle: "",
    save: () => undefined,
    restore: () => undefined,
    fillRect: () => undefined,
    beginPath: () => undefined,
    moveTo: () => undefined,
    quadraticCurveTo: () => undefined,
    closePath: () => undefined,
    fill: () => {
      fillCalls += 1;
    },
    createLinearGradient: () => gradient
  };
  return {
    ctx: ctx as CanvasRenderingContext2D,
    get fillCalls() {
      return fillCalls;
    }
  };
};

// Same seed used by client-forest-3d-regression.test.ts and
// vision-footprint-table.test.ts's KNOWN_HILLS_TILE — moved together with
// that constant once hills were concentrated into the BROKEN_HIGHLANDS
// region (see isHillsRegionAt in worldgen-hills.ts).
const seededHillsTile = { x: 99, y: 57 };

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
  ({ drawHillsOverlay } = await import("../client-map-render-hills-overlay.js"));
  ({ setTrue3DRendererActive } = await import("../client-renderer-mode.js"));
  hillsConstants = await import("../client-constants.js");
  expect(hillsConstants.isHillsTile(seededHillsTile.x, seededHillsTile.y)).toBe(true);
});

afterEach(() => {
  setTrue3DRendererActive(false);
});

describe("3d hills rendering regression guard", () => {
  it("draws the legacy hills overlay for hills tiles while true 3d is disabled", () => {
    const mock = createMockContext();

    setTrue3DRendererActive(false);
    drawHillsOverlay(mock.ctx, seededHillsTile.x, seededHillsTile.y, 0, 0, 48);

    expect(mock.fillCalls).toBeGreaterThan(0);
  });

  it("skips the legacy hills overlay entirely while the true 3d renderer is active", () => {
    const mock = createMockContext();

    setTrue3DRendererActive(true);
    drawHillsOverlay(mock.ctx, seededHillsTile.x, seededHillsTile.y, 0, 0, 48);

    expect(mock.fillCalls).toBe(0);
  });

  it("ownership overlay material uses depthTest:false to stay visible on top of hill domes", () => {
    const overlaySource = clientSource("../client-map-3d-ownership-overlay.ts");
    expect(overlaySource).toContain("depthTest: false,");
    // depthWrite: false is already set — verify both so neither regresses.
    expect(overlaySource).toContain("depthWrite: false,");
  });

  it("surfaceY includes HEIGHTFIELD_HILLS_ELEVATION_BONUS on hill tiles so structures sit above hill domes", () => {
    const mapSource = clientSource("../client-map-3d/client-map-3d.ts");
    expect(mapSource).toContain("HEIGHTFIELD_HILLS_ELEVATION_BONUS");
    expect(mapSource).toContain("isHillsTile(wx, wy) ? HEIGHTFIELD_HILLS_ELEVATION_BONUS : 0");
  });
});
