import { describe, expect, it } from "vitest";

import { drawFrontierSupply2D, type FrontierSupply2DDeps } from "./client-frontier-supply-2d.js";
import type { FrontierSupplyLink, FrontierSupplyModel } from "./client-frontier-supply.js";
import { SUPPLY_BODY_WHITE_MIX, SUPPLY_CORE_WHITE_MIX } from "./client-frontier-supply-style.js";
import { lightenHex } from "../client-map-3d-utils/client-map-3d-utils.js";

type Call = { op: string; args: unknown[]; alpha: number; stroke: string; fill: string; lineWidth: number };

/** Records path/style calls so the test can check what was drawn, without a real canvas. */
const recordingContext = (): { ctx: CanvasRenderingContext2D; calls: Call[] } => {
  const calls: Call[] = [];
  const state = { globalAlpha: 1, strokeStyle: "", fillStyle: "", lineWidth: 1, lineCap: "butt", lineJoin: "miter" };
  const record = (op: string) => (...args: unknown[]) => {
    calls.push({ op, args, alpha: state.globalAlpha, stroke: String(state.strokeStyle), fill: String(state.fillStyle), lineWidth: state.lineWidth });
  };
  const ctx = new Proxy(state, {
    get: (target, prop: string) => (prop in target ? target[prop as keyof typeof target] : record(prop))
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
};

const deps = (overrides: Partial<FrontierSupply2DDeps> = {}): FrontierSupply2DDeps => ({
  tileCenter: (x, y) => ({ sx: x * 32 + 16, sy: y * 32 + 16 }),
  size: 32,
  viewportWidth: 640,
  viewportHeight: 480,
  ownerColor: "#3fa9f5",
  nowMs: 0,
  ...overrides
});

const link = (fromX: number, toX: number, tip = true): FrontierSupplyLink => ({ from: { x: fromX, y: 2 }, to: { x: toX, y: 2 }, tip });
/** A one-wide snake from x=2 to x=8, hop by hop, ending in a tip. */
const snake = (): FrontierSupplyModel => ({ links: [2, 3, 4, 5, 6, 7].map((x) => link(x, x + 1, x === 7)), cuts: [{ x: 3, y: 2 }] });

/** The empire colour lifted toward white, as both renderers tint the body and the core. */
const BODY = lightenHex("#3fa9f5", SUPPLY_BODY_WHITE_MIX);
const CORE = lightenHex("#3fa9f5", SUPPLY_CORE_WHITE_MIX);

const strokes = (calls: Call[]) => calls.filter((call) => call.op === "stroke");
const fills = (calls: Call[]) => calls.filter((call) => call.op === "fill");

describe("drawFrontierSupply2D", () => {
  it("strokes each route as a dark shadow edge, a lightly tinted body and a paler core, with no arrowhead at the tip", () => {
    const { ctx, calls } = recordingContext();
    drawFrontierSupply2D(ctx, { links: [link(2, 3, false), link(3, 4)], cuts: [] }, deps());
    const colours = strokes(calls).map((call) => call.stroke);
    expect(colours).toContain("#05080d");
    expect(colours).toContain(BODY);
    expect(colours).toContain(CORE);
    expect(fills(calls)).toHaveLength(0);
  });

  it("keeps the steady route very pale so only the travelling pulses stand out", () => {
    const { ctx, calls } = recordingContext();
    drawFrontierSupply2D(ctx, snake(), deps({ nowMs: 1000 }));
    const bodyAlphas = strokes(calls).filter((call) => call.stroke === BODY).map((call) => call.alpha);
    expect(Math.min(...bodyAlphas)).toBeLessThan(0.1); // the resting ribbon
    expect(Math.max(...bodyAlphas)).toBeGreaterThan(0.3); // a pulse passing
    expect(Math.max(...bodyAlphas)).toBeLessThan(0.7); // ...but dimmed even then
  });

  it("strokes the pulse layer by layer, so a pulse's shadow never lands on its own bright head", () => {
    const { ctx, calls } = recordingContext();
    drawFrontierSupply2D(ctx, { ...snake(), cuts: [] }, deps({ nowMs: 1000 }));
    const all = strokes(calls);
    // Pulse heads are the widest white strokes (the steady core is narrower).
    const headWidth = Math.max(...all.filter((call) => call.stroke === CORE).map((call) => call.lineWidth));
    const firstHead = all.findIndex((call) => call.stroke === CORE && call.lineWidth === headWidth);
    expect(firstHead).toBeGreaterThanOrEqual(0);
    expect(all.slice(firstHead).some((call) => call.stroke === "#05080d")).toBe(false);
  });

  it("never draws the route or ring thinner than a pixel, however small the tiles", () => {
    const { ctx, calls } = recordingContext();
    drawFrontierSupply2D(ctx, snake(), deps({ size: 4, tileCenter: (x, y) => ({ sx: x * 4 + 2, sy: y * 4 + 2 }), nowMs: 1000 }));
    const widths = strokes(calls).map((call) => call.lineWidth);
    expect(widths.length).toBeGreaterThan(0);
    expect(Math.min(...widths)).toBeGreaterThanOrEqual(1);
  });

  it("marks each cut tile with a ring that breathes at the pulses' pace", () => {
    const ringAt = (nowMs: number) => {
      const { ctx, calls } = recordingContext();
      drawFrontierSupply2D(ctx, snake(), deps({ nowMs }));
      return calls.find((call) => call.op === "arc")!;
    };
    const ring = ringAt(0);
    expect(ring.args.slice(0, 2)).toEqual([3 * 32 + 16, 2 * 32 + 16]);
    expect(ring.alpha).not.toBeCloseTo(ringAt(1000).alpha, 2);
  });

  it("skips routes and rings that are entirely off screen, and draws nothing for an empty model", () => {
    const far = recordingContext();
    drawFrontierSupply2D(far.ctx, { links: [{ from: { x: 90, y: 90 }, to: { x: 91, y: 90 }, tip: true }], cuts: [{ x: 90, y: 90 }] }, deps());
    expect(strokes(far.calls)).toHaveLength(0);
    // A long route whose first tile is just off screen but which never comes into view.
    const offside = recordingContext();
    const chain = Array.from({ length: 40 }, (_, i): FrontierSupplyLink => ({ from: { x: -3 - i, y: 2 }, to: { x: -4 - i, y: 2 }, tip: i === 39 }));
    drawFrontierSupply2D(offside.ctx, { links: chain, cuts: [] }, deps());
    expect(strokes(offside.calls)).toHaveLength(0);
    const empty = recordingContext();
    drawFrontierSupply2D(empty.ctx, { links: [], cuts: [] }, deps());
    expect(empty.calls).toHaveLength(0);
  });
});
