import { beforeAll, describe, expect, it, vi } from "vitest";
import { setWorldSeed } from "@border-empires/shared";
import { BLACKWOOD_SWIRL_PERIOD_S, blackwoodSwirlPhaseS } from "../client-prospect-clue/client-prospect-clue.js";
import type { ProspectClueDraw } from "../client-prospect-signature-overlay.js";

// The Blackwood canopy clue on the 2D map: a purple swirl rising out of the
// forest every BLACKWOOD_SWIRL_PERIOD_S seconds (it used to darken the trees
// and plant black trees on open ground, which looked odd).

let drawForestOverlay: typeof import("./client-map-render-forest-overlay.js").drawForestOverlay;
let isForestTile: typeof import("../client-constants.js").isForestTile;
let prospectClueDrawFor: typeof import("../client-prospect-signature-overlay.js").prospectClueDrawFor;

type Recorder = { ctx: CanvasRenderingContext2D; strokes: string[] };

const createRecorder = (): Recorder => {
  const recorder: Recorder = { ctx: undefined as unknown as CanvasRenderingContext2D, strokes: [] };
  let strokeStyle = "";
  const ctx = {
    fillStyle: "",
    lineWidth: 1,
    lineCap: "butt",
    get strokeStyle() {
      return strokeStyle;
    },
    set strokeStyle(value: string) {
      strokeStyle = value;
    },
    save: () => undefined,
    restore: () => undefined,
    fillRect: () => undefined,
    beginPath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    arc: () => undefined,
    closePath: () => undefined,
    fill: () => undefined,
    stroke: () => {
      recorder.strokes.push(strokeStyle);
    }
  };
  recorder.ctx = ctx as unknown as CanvasRenderingContext2D;
  return recorder;
};

const BLACKWOOD: ProspectClueDraw = { signature: "BLACKWOOD_CANOPY", propsAllowed: true };

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
  ({ isForestTile } = await import("../client-constants.js"));
  ({ prospectClueDrawFor } = await import("../client-prospect-signature-overlay.js"));
});

const forestTile = (): { x: number; y: number } => {
  setWorldSeed(2024);
  for (let x = 0; x < 200; x += 1) for (let y = 20; y < 220; y += 1) if (isForestTile(x, y)) return { x, y };
  throw new Error("no forest tile in sample");
};

// Date.now() for a moment `offsetS` into the tile's swirl cycle.
const atCycleOffset = (x: number, y: number, offsetS: number): void => {
  const nowS = BLACKWOOD_SWIRL_PERIOD_S * 1000 - blackwoodSwirlPhaseS(x, y) + offsetS;
  vi.spyOn(Date, "now").mockReturnValue(nowS * 1000);
};

const swirlStrokes = (draw: (ctx: CanvasRenderingContext2D) => void): string[] => {
  const recorder = createRecorder();
  draw(recorder.ctx);
  vi.restoreAllMocks();
  return recorder.strokes.filter((style) => style.startsWith("rgba(168, 97, 242,"));
};

describe("2D blackwood canopy clue", () => {
  it("swirls over a blackwood forest tile mid-cycle, and not between swirls", () => {
    const { x, y } = forestTile();
    atCycleOffset(x, y, 0.9);
    expect(swirlStrokes((ctx) => drawForestOverlay(ctx, x, y, 0, 0, 48, BLACKWOOD, () => true))).toHaveLength(1);
    atCycleOffset(x, y, 3.5);
    expect(swirlStrokes((ctx) => drawForestOverlay(ctx, x, y, 0, 0, 48, BLACKWOOD, () => true))).toHaveLength(0);
  });

  it("draws nothing on open ground or a tile that shows its own feature", () => {
    const { x, y } = forestTile();
    atCycleOffset(x, y, 0.9);
    expect(swirlStrokes((ctx) => drawForestOverlay(ctx, x, y, 0, 0, 48, BLACKWOOD, () => false))).toHaveLength(0);
    atCycleOffset(x, y, 0.9);
    expect(swirlStrokes((ctx) => drawForestOverlay(ctx, x, y, 0, 0, 48, { signature: "BLACKWOOD_CANOPY", propsAllowed: false }, () => true))).toHaveLength(0);
  });
});

// Review finding: 2D drew clues on fogged (remembered) tiles while true-3D draws them only on visible ones.
describe("prospectClueDrawFor", () => {
  const tile = { x: 1, y: 1, terrain: "LAND" as const, prospectSignature: "FERROUS_DUST" as const };

  it("draws no clue on a tile that isn't visible", () => {
    expect(prospectClueDrawFor(tile, true, new Set())).toEqual({ signature: "FERROUS_DUST", propsAllowed: true });
    expect(prospectClueDrawFor(tile, false, new Set())).toBeUndefined();
  });

  it("draws no clue whose resource is already revealed", () => {
    expect(prospectClueDrawFor(tile, true, new Set(["FERROUS_DUST"]))).toBeUndefined();
  });
});
