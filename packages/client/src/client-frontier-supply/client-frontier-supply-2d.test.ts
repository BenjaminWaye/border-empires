import { describe, expect, it } from "vitest";

import { drawFrontierSupply2D, type FrontierSupply2DDeps } from "./client-frontier-supply-2d.js";
import type { FrontierSupplyLink, FrontierSupplyModel } from "./client-frontier-supply.js";
import { SUPPLY_DASH_GAP, SUPPLY_DASH_LENGTH, SUPPLY_LINE_ALPHA } from "./client-frontier-supply-style.js";

type Call = { op: string; args: unknown[]; alpha: number; stroke: string; lineWidth: number; dashOffset: number };

/** Records path/style calls so the test can check what was drawn, without a real canvas. */
const recordingContext = (): { ctx: CanvasRenderingContext2D; calls: Call[] } => {
  const calls: Call[] = [];
  const state = { globalAlpha: 1, strokeStyle: "", fillStyle: "", lineWidth: 1, lineCap: "butt", lineJoin: "miter", lineDashOffset: 0 };
  const record = (op: string) => (...args: unknown[]) => {
    calls.push({ op, args, alpha: state.globalAlpha, stroke: String(state.strokeStyle), lineWidth: state.lineWidth, dashOffset: state.lineDashOffset });
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
  ...overrides
});

const link = (fromX: number, toX: number, y = 2, tip = true): FrontierSupplyLink => ({ from: { x: fromX, y }, to: { x: toX, y }, tip });

const strokes = (calls: Call[]) => calls.filter((call) => call.op === "stroke");

describe("drawFrontierSupply2D", () => {
  it("strokes each route once as a thin, faint dashed line in a pale empire tint, with no fills", () => {
    const { ctx, calls } = recordingContext();
    drawFrontierSupply2D(ctx, { links: [link(2, 3, 2, false), link(3, 4)], cuts: [] }, deps());
    const lines = strokes(calls);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.stroke).not.toBe("#3fa9f5"); // lifted toward white
    expect(lines[0]!.stroke).toMatch(/^#[0-9a-f]{6}$/);
    expect(lines[0]!.alpha).toBe(SUPPLY_LINE_ALPHA);
    expect(lines[0]!.lineWidth).toBeLessThanOrEqual(2);
    const dash = calls.find((call) => call.op === "setLineDash")!;
    expect(dash.args[0]).toEqual([SUPPLY_DASH_LENGTH * 32, SUPPLY_DASH_GAP * 32]);
    expect(calls.some((call) => call.op === "fill")).toBe(false);
  });

  it("draws a solid ring on each cut tile", () => {
    const { ctx, calls } = recordingContext();
    drawFrontierSupply2D(ctx, { links: [link(2, 3)], cuts: [{ x: 2, y: 2 }] }, deps());
    const arc = calls.find((call) => call.op === "arc")!;
    expect(arc.args.slice(0, 2)).toEqual([2 * 32 + 16, 2 * 32 + 16]);
    // The ring is stroked after the dash pattern is cleared.
    const clearDash = calls.findIndex((call) => call.op === "setLineDash" && (call.args[0] as number[]).length === 0);
    expect(clearDash).toBeGreaterThanOrEqual(0);
    expect(calls.indexOf(arc)).toBeGreaterThan(clearDash);
  });

  it("offsets each branch's dashes by its distance from the cut, so the pattern runs on through a fork", () => {
    const { ctx, calls } = recordingContext();
    // Trunk 2 -> 3, then branches 3 -> 4 (y=2) and 3 -> (4,3).
    const fork: FrontierSupplyModel = { links: [link(2, 3, 2, false), link(3, 4), { from: { x: 3, y: 2 }, to: { x: 4, y: 3 }, tip: true }], cuts: [] };
    drawFrontierSupply2D(ctx, fork, deps());
    const offsets = strokes(calls).map((call) => call.dashOffset).sort((a, b) => a - b);
    expect(offsets).toEqual([0, 32, 32]);
  });

  it("skips routes and rings that are entirely off screen, and draws nothing for an empty model", () => {
    const far = recordingContext();
    drawFrontierSupply2D(far.ctx, { links: [{ from: { x: 90, y: 90 }, to: { x: 91, y: 90 }, tip: true }], cuts: [{ x: 90, y: 90 }] }, deps());
    expect(strokes(far.calls)).toHaveLength(0);
    // A long route whose cut tile is just off screen but which never comes into view.
    const offside = recordingContext();
    const chain = Array.from({ length: 40 }, (_, i): FrontierSupplyLink => ({ from: { x: -3 - i, y: 2 }, to: { x: -4 - i, y: 2 }, tip: i === 39 }));
    drawFrontierSupply2D(offside.ctx, { links: chain, cuts: [] }, deps());
    expect(strokes(offside.calls)).toHaveLength(0);
    const empty = recordingContext();
    drawFrontierSupply2D(empty.ctx, { links: [], cuts: [] }, deps());
    expect(empty.calls).toHaveLength(0);
  });
});
