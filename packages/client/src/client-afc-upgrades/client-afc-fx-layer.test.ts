// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { createAfcFxLayer } from "./client-afc-fx-layer.js";

let true3D = false;
vi.mock("../client-renderer-mode.js", () => ({ isTrue3DRendererActive: () => true3D }));

const setup = () => {
  document.body.innerHTML = "<div><canvas width='100' height='100'></canvas></div>";
  const canvas = document.querySelector("canvas")!;
  vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100, toJSON: () => ({}) });
  const state = createInitialState(); state.me = "p";
  return { canvas, state };
};

describe("AFC map effects in both renderers", () => {
  it.each([false, true])("draws the hijack beam from caster to target and its progress through the %s projection", active => {
    true3D = active;
    const { canvas, state } = setup();
    state.afcHijacks = [{ targetX: 5, targetY: 0, casterX: 1, casterY: 0, attackerId: "e", victimId: "p", startedAt: 0, endsAt: 600_000 }];
    const layer = createAfcFxLayer(canvas, state);
    layer.render({ size: 10, project: (x, y) => ({ sx: x * 10, sy: y * 10 }) }, [], 300_000);
    const beam = document.querySelector(".afc-fx-hijack-beam")!;
    const offset = active ? 0 : 5;
    expect(beam.getAttribute("x1")).toBe(String(10 + offset));
    expect(beam.getAttribute("x2")).toBe(String(50 + offset));
    const [filled, total] = (document.querySelector(".afc-fx-hijack-progress")?.getAttribute("stroke-dasharray") ?? "").split(" ").map(Number);
    expect(filled! / total!).toBeCloseTo(0.5); // halfway through the 10-minute takeover
    expect(Array.from(document.querySelectorAll(".afc-fx-label"), label => label.textContent)).toEqual(["Hijack! 5:00", "Hijacking tower"]);
  });

  it("plays Breakthrough, hijack endings and Counterphase static, then clears expired effects", () => {
    true3D = true;
    const { canvas, state } = setup();
    state.afcBreakthroughs = [{ attackerId: "p", fromX: 1, fromY: 1, tiles: [{ x: 2, y: 1 }, { x: 1, y: 2 }], at: 1000 }];
    state.afcHijackOutcomes = [{ targetX: 3, targetY: 3, attackerId: "p", victimId: "e", status: "succeeded", at: 1000 }];
    const layer = createAfcFxLayer(canvas, state);
    layer.render({ size: 10, project: (x, y) => ({ sx: x * 10, sy: y * 10 }) }, [{ wx: 4, wy: 4, suppressed: true }, { wx: 6, wy: 6, suppressed: false }], 1500);
    expect(document.querySelectorAll(".afc-fx-breach")).toHaveLength(2);
    expect(document.querySelector(".afc-fx-flash")).not.toBeNull();
    expect(document.querySelectorAll(".afc-fx-static")).toHaveLength(1);
    layer.render({ size: 10, project: (x, y) => ({ sx: x * 10, sy: y * 10 }) }, [], 60_000);
    expect(document.querySelector(".afc-fx-layer")?.childElementCount).toBe(0);
  });
});
