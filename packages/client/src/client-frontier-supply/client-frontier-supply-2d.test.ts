import { describe, expect, it } from "vitest";

import { drawFrontierSupply2D, type FrontierSupply2DDeps } from "./client-frontier-supply-2d.js";
import type { FrontierSupplyModel } from "./client-frontier-supply.js";

type Call = { op: string; args: number[]; alpha: number; stroke: string };

/** Records path/transform calls so the test can check what was drawn where, without a real canvas. */
const recordingContext = (): { ctx: CanvasRenderingContext2D; calls: Call[] } => {
  const calls: Call[] = [];
  const state = { globalAlpha: 1, strokeStyle: "", lineWidth: 1, lineCap: "butt", lineJoin: "miter" };
  const record = (op: string) => (...args: number[]) => { calls.push({ op, args, alpha: state.globalAlpha, stroke: String(state.strokeStyle) }); };
  const ctx = new Proxy(state, {
    get: (target, prop: string) => (prop in target ? target[prop as keyof typeof target] : record(prop))
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
};

const deps = (overrides: Partial<FrontierSupply2DDeps> = {}): FrontierSupply2DDeps => ({
  tileCenter: (x, y) => ({ sx: x * 32 + 16, sy: y * 32 + 16 }),
  wrapDeltaX: (from, to) => to - from,
  wrapDeltaY: (from, to) => to - from,
  size: 32,
  viewportWidth: 640,
  viewportHeight: 480,
  ownerColor: "#3fa9f5",
  nowMs: 400, // a quarter of the flow period: chevrons sit a quarter of the way along
  ...overrides
});

const oneHop: FrontierSupplyModel = {
  links: [{ from: { x: 2, y: 2 }, to: { x: 3, y: 2 }, depthBeyondReach: 1, fragile: false }],
  chokepoints: new Map([["2,2", { x: 2, y: 2, dependentTiles: 1, pinch: true }]])
};

describe("drawFrontierSupply2D", () => {
  it("draws the chevron partway along the hop in the empire colour, over a dark underlay", () => {
    const { ctx, calls } = recordingContext();
    drawFrontierSupply2D(ctx, oneHop, deps());
    const translates = calls.filter((call) => call.op === "translate");
    // Two chevrons per hop at this size (phases 0 and 0.5), each drawn twice (underlay + colour).
    expect(translates).toHaveLength(4);
    expect(translates[0]!.args).toEqual([80 + 32 * 0.25, 80]);
    const strokes = calls.filter((call) => call.op === "stroke").map((call) => call.stroke);
    expect(strokes).toContain("#3fa9f5");
    expect(strokes).toContain("#0b0f16");
  });

  it("outlines a pinch-point chokepoint in amber, but not every chokepoint along a fragile stretch", () => {
    const { ctx, calls } = recordingContext();
    drawFrontierSupply2D(ctx, oneHop, deps());
    expect(calls.some((call) => call.op === "closePath")).toBe(true);
    expect(calls.filter((call) => call.op === "stroke").at(-1)?.stroke).toBe("#ffb03b");

    const notPinch = recordingContext();
    drawFrontierSupply2D(notPinch.ctx, { ...oneHop, chokepoints: new Map([["2,2", { x: 2, y: 2, dependentTiles: 1, pinch: false }]]) }, deps());
    expect(notPinch.calls.some((call) => call.op === "closePath")).toBe(false);
  });

  it("draws a hop out of a chokepoint in amber instead of the empire colour", () => {
    const { ctx, calls } = recordingContext();
    drawFrontierSupply2D(ctx, { links: [{ ...oneHop.links[0]!, fragile: true }], chokepoints: new Map() }, deps());
    const strokes = calls.filter((call) => call.op === "stroke").map((call) => call.stroke);
    expect(strokes).toContain("#ffb03b");
    expect(strokes).not.toContain("#3fa9f5");
  });

  it("skips hops that are entirely off screen", () => {
    const { ctx, calls } = recordingContext();
    const far: FrontierSupplyModel = { links: [{ from: { x: 90, y: 90 }, to: { x: 91, y: 90 }, depthBeyondReach: 1, fragile: false }], chokepoints: new Map() };
    drawFrontierSupply2D(ctx, far, deps());
    expect(calls.filter((call) => call.op === "translate")).toHaveLength(0);
  });

  it("draws nothing for an empty model", () => {
    const { ctx, calls } = recordingContext();
    drawFrontierSupply2D(ctx, { links: [], chokepoints: new Map() }, deps());
    expect(calls).toHaveLength(0);
  });
});
