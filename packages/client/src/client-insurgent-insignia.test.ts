import { describe, expect, it } from "vitest";
import { INSURGENT_MARK_COLOR, paintInsurgentMark } from "./client-insurgent-insignia.js";

// Records the compositing steps and the single colour the mark is tinted to.
const recordingCtx = () => {
  const steps: string[] = [];
  const noop = (): void => {};
  let op = "source-over";
  let fillStyle = "";
  const ctx = {
    save: noop, restore: noop, translate: noop, scale: noop, beginPath: noop, moveTo: noop, lineTo: noop, quadraticCurveTo: noop, closePath: noop,
    lineCap: "butt", lineWidth: 1,
    set globalCompositeOperation(value: string) { op = value; },
    get globalCompositeOperation() { return op; },
    set fillStyle(value: string) { fillStyle = value; },
    fill: () => { steps.push(`fill:${op}`); },
    stroke: () => { steps.push(`stroke:${op}`); },
    fillRect: () => { steps.push(`fillRect:${op}:${fillStyle}`); }
  } as unknown as CanvasRenderingContext2D;
  return { ctx, steps };
};

describe("paintInsurgentMark", () => {
  it("fills the fist, cuts its lines out, then tints it to one faint colour", () => {
    const { ctx, steps } = recordingCtx();
    paintInsurgentMark(ctx, 128);
    expect(steps).toEqual(["fill:source-over", "stroke:destination-out", `fillRect:source-in:${INSURGENT_MARK_COLOR}`]);
  });

  it("is faint: the mark's colour is well below full opacity", () => {
    const alpha = Number(/rgba\([^)]*,\s*([\d.]+)\)/.exec(INSURGENT_MARK_COLOR)?.[1]);
    expect(alpha).toBeGreaterThan(0.2);
    expect(alpha).toBeLessThan(0.6);
  });
});
