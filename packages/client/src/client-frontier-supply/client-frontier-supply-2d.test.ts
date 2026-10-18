import { describe, expect, it } from "vitest";

import { drawFrontierSupply2D, type FrontierSupply2DDeps } from "./client-frontier-supply-2d.js";
import type { FrontierSupplyModel } from "./client-frontier-supply.js";

type Call = { op: string; args: number[]; alpha: number; stroke: string; fill: string; lineWidth: number };

/** Records path/style calls so the test can check what was drawn, without a real canvas. */
const recordingContext = (): { ctx: CanvasRenderingContext2D; calls: Call[] } => {
  const calls: Call[] = [];
  const state = { globalAlpha: 1, strokeStyle: "", fillStyle: "", lineWidth: 1, lineCap: "butt", lineJoin: "miter" };
  const record = (op: string) => (...args: number[]) => {
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

const link = (fromX: number, toX: number, extra: { downstream?: number; depth?: number; tip?: boolean } = {}) => ({
  from: { x: fromX, y: 2 },
  to: { x: toX, y: 2 },
  depthBeyondReach: extra.depth ?? toX - 2,
  downstream: extra.downstream ?? 1,
  tip: extra.tip ?? true
});

const strokes = (calls: Call[]) => calls.filter((call) => call.op === "stroke");
const fills = (calls: Call[]) => calls.filter((call) => call.op === "fill");

describe("drawFrontierSupply2D", () => {
  it("strokes each route as a dark shadow edge, an empire-coloured body and a light core, then fills an arrowhead at the tip", () => {
    const { ctx, calls } = recordingContext();
    const model: FrontierSupplyModel = { links: [link(2, 3, { downstream: 2, tip: false }), link(3, 4)] };
    drawFrontierSupply2D(ctx, model, deps());
    const colours = strokes(calls).map((call) => call.stroke);
    expect(colours).toContain("#05080d");
    expect(colours).toContain("#3fa9f5");
    expect(colours).toContain("#ffffff");
    // Shadow is the widest layer, the core the narrowest.
    const widthOf = (colour: string) => Math.max(...strokes(calls).filter((call) => call.stroke === colour).map((call) => call.lineWidth));
    expect(widthOf("#05080d")).toBeGreaterThan(widthOf("#3fa9f5"));
    expect(widthOf("#3fa9f5")).toBeGreaterThan(widthOf("#ffffff"));
    expect(fills(calls).some((call) => call.fill === "#3fa9f5")).toBe(true); // arrowhead body
  });

  it("draws the route thicker where it feeds more land", () => {
    const thick = recordingContext();
    drawFrontierSupply2D(thick.ctx, { links: [link(2, 3, { downstream: 9 })] }, deps());
    const thin = recordingContext();
    drawFrontierSupply2D(thin.ctx, { links: [link(2, 3, { downstream: 1 })] }, deps());
    const bodyWidth = (calls: Call[]) => Math.max(...strokes(calls).filter((call) => call.stroke === "#3fa9f5").map((call) => call.lineWidth));
    expect(bodyWidth(thick.calls)).toBeGreaterThan(bodyWidth(thin.calls));
  });

  it("skips routes that are entirely off screen, and draws nothing for an empty model", () => {
    const far = recordingContext();
    drawFrontierSupply2D(far.ctx, { links: [{ ...link(2, 3), from: { x: 90, y: 90 }, to: { x: 91, y: 90 } }] }, deps());
    expect(strokes(far.calls)).toHaveLength(0);
    const empty = recordingContext();
    drawFrontierSupply2D(empty.ctx, { links: [] }, deps());
    expect(empty.calls).toHaveLength(0);
  });

  it("keeps the steady route pale so only the travelling pulses stand out", () => {
    const { ctx, calls } = recordingContext();
    drawFrontierSupply2D(ctx, { links: [link(2, 8, { depth: 1 })] }, deps({ nowMs: 1000 }));
    const bodyAlphas = strokes(calls).filter((call) => call.stroke === "#3fa9f5").map((call) => call.alpha);
    expect(Math.min(...bodyAlphas)).toBeLessThan(0.2); // the resting ribbon
    expect(Math.max(...bodyAlphas)).toBeGreaterThan(0.3); // a pulse passing
  });
});
