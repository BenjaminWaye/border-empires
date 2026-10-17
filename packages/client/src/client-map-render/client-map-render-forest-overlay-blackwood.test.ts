import { beforeAll, describe, expect, it } from "vitest";
import { setWorldSeed } from "@border-empires/shared";
import { prospectCluePropCount } from "../client-prospect-clue/client-prospect-clue.js";
import type { ProspectClueDraw } from "../client-prospect-signature-overlay.js";

// Regression: the Blackwood canopy clue used to be only a violet tint plus a
// dashed line on the 2D map. It must now draw actual blackwood trees -- on
// open ground, and by darkening a forest tile's own trees.

let drawForestOverlay: typeof import("./client-map-render-forest-overlay.js").drawForestOverlay;
let isLightGrassScatterTile: typeof import("../client-constants.js").isLightGrassScatterTile;
let prospectClueDrawFor: typeof import("../client-prospect-signature-overlay.js").prospectClueDrawFor;

type Recorder = { ctx: CanvasRenderingContext2D; fillRects: number; filledStyles: string[] };

const createRecorder = (): Recorder => {
  const recorder: Recorder = { ctx: undefined as unknown as CanvasRenderingContext2D, fillRects: 0, filledStyles: [] };
  let fillStyle = "";
  const ctx = {
    get fillStyle() {
      return fillStyle;
    },
    set fillStyle(value: string) {
      fillStyle = value;
    },
    save: () => undefined,
    restore: () => undefined,
    fillRect: () => {
      recorder.fillRects += 1;
    },
    beginPath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    arc: () => undefined,
    closePath: () => undefined,
    fill: () => {
      recorder.filledStyles.push(fillStyle);
    }
  };
  recorder.ctx = ctx as unknown as CanvasRenderingContext2D;
  return recorder;
};

const BLACKWOOD: ProspectClueDraw = { signature: "BLACKWOOD_CANOPY", propsAllowed: true };
const BLACKWOOD_CANOPY_FILL = /^rgba\(42, 28, 58,/;

beforeAll(async () => {
  class MockImage {
    decoding = "";
    src = "";
    complete = true;
    naturalWidth = 1;
    naturalHeight = 1;
  }
  Object.assign(globalThis, { Image: MockImage });
  ({ drawForestOverlay } = await import("./client-map-render-forest-overlay.js"));
  ({ isLightGrassScatterTile } = await import("../client-constants.js"));
  ({ prospectClueDrawFor } = await import("../client-prospect-signature-overlay.js"));
});

const openTile = (): { x: number; y: number } => {
  setWorldSeed(2024);
  for (let x = 0; x < 200; x += 1) {
    for (let y = 20; y < 220; y += 1) if (!isLightGrassScatterTile(x, y)) return { x, y };
  }
  throw new Error("no open tile in sample");
};

describe("2D blackwood canopy clue", () => {
  it("plants the shared number of blackwood trees on an open clue tile", () => {
    const { x, y } = openTile();
    const plain = createRecorder();
    drawForestOverlay(plain.ctx, x, y, 0, 0, 48, undefined, () => false);
    expect(plain.filledStyles).toHaveLength(0);

    const clue = createRecorder();
    drawForestOverlay(clue.ctx, x, y, 0, 0, 48, BLACKWOOD, () => false);
    const canopies = clue.filledStyles.filter((style) => BLACKWOOD_CANOPY_FILL.test(style));
    expect(canopies).toHaveLength(prospectCluePropCount("BLACKWOOD_CANOPY", x, y));
  });

  it("draws no trees on a clue tile that already shows its own feature", () => {
    const { x, y } = openTile();
    const clue = createRecorder();
    drawForestOverlay(clue.ctx, x, y, 0, 0, 48, { signature: "BLACKWOOD_CANOPY", propsAllowed: false }, () => false);
    expect(clue.filledStyles).toHaveLength(0);
  });

  it("turns a forest tile's own canopy violet-black instead of green", () => {
    const { x, y } = openTile();
    const green = createRecorder();
    drawForestOverlay(green.ctx, x, y, 0, 0, 48, undefined, () => true);
    const dark = createRecorder();
    drawForestOverlay(dark.ctx, x, y, 0, 0, 48, BLACKWOOD, () => true);
    expect(dark.filledStyles).toHaveLength(green.filledStyles.length);
    expect(dark.filledStyles).not.toEqual(green.filledStyles);
    expect(green.filledStyles.some((style) => style.startsWith("rgba(14, 41, 18,") || style.startsWith("rgba(74, 115, 46,") || style.startsWith("rgba(58, 122, 58,"))).toBe(true);
    expect(dark.filledStyles.some((style) => style.startsWith("rgba(14, 41, 18,") || style.startsWith("rgba(74, 115, 46,") || style.startsWith("rgba(58, 122, 58,"))).toBe(false);
  });

  // Review finding: a light-grass sapling counted as "already wooded", so a
  // blackwood clue there only darkened one tiny sapling.
  it("still plants the grove beside a light-grass sapling", () => {
    setWorldSeed(2024);
    let scatter: { x: number; y: number } | undefined;
    for (let x = 0; x < 200 && !scatter; x += 1) for (let y = 20; y < 220 && !scatter; y += 1) if (isLightGrassScatterTile(x, y)) scatter = { x, y };
    expect(scatter).toBeDefined();
    const clue = createRecorder();
    drawForestOverlay(clue.ctx, scatter!.x, scatter!.y, 0, 0, 48, BLACKWOOD, () => false);
    const canopies = clue.filledStyles.filter((style) => BLACKWOOD_CANOPY_FILL.test(style));
    expect(canopies).toHaveLength(prospectCluePropCount("BLACKWOOD_CANOPY", scatter!.x, scatter!.y));
  });
});

// Review finding: 2D drew clues on fogged (remembered) tiles while true-3D draws them only on visible ones.
describe("prospectClueDrawFor", () => {
  it("draws no clue on a tile that isn't visible", () => {
    const tile = { x: 1, y: 1, terrain: "LAND" as const, prospectSignature: "FERROUS_DUST" as const };
    expect(prospectClueDrawFor(tile, true)).toEqual({ signature: "FERROUS_DUST", propsAllowed: true });
    expect(prospectClueDrawFor(tile, false)).toBeUndefined();
  });
});
