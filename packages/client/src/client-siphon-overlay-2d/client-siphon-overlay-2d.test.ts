import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { drawSiphonOverlay2D } from "./client-siphon-overlay-2d.js";

// Minimal CanvasRenderingContext2D recorder: counts the strokes each call makes.
const recorder = () => {
  const calls: string[] = [];
  const ctx = {
    lineWidth: 1,
    strokeStyle: "",
    beginPath: () => calls.push("beginPath"),
    moveTo: () => undefined,
    lineTo: () => undefined,
    arc: () => calls.push("arc"),
    stroke: () => calls.push("stroke")
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
};

describe("2D Siphon overlay", () => {
  it("draws the drained-tile X only while the sabotage is live", () => {
    const live = recorder();
    drawSiphonOverlay2D(live.ctx, { sabotage: { ownerId: "p1", endsAt: 2_000, outputMultiplier: 0 } }, 0, 0, 20, 1_000);
    expect(live.calls.filter((call) => call === "stroke")).toHaveLength(1);
    const expired = recorder();
    drawSiphonOverlay2D(expired.ctx, { sabotage: { ownerId: "p1", endsAt: 500, outputMultiplier: 0 } }, 0, 0, 20, 1_000);
    expect(expired.calls).toEqual([]);
  });

  it("marks a tower in siphon mode with a ring and spiral, and restores lineWidth", () => {
    const { ctx, calls } = recorder();
    drawSiphonOverlay2D(ctx, { observatory: { ownerId: "p1", status: "active", siphon: { targetX: 1, targetY: 1, tileKeys: ["1,1"], startedAt: 0 } } }, 0, 0, 20, 1_000);
    expect(calls).toContain("arc");
    expect(calls.filter((call) => call === "stroke")).toHaveLength(2);
    expect(ctx.lineWidth).toBe(1);
    const idle = recorder();
    drawSiphonOverlay2D(idle.ctx, { observatory: { ownerId: "p1", status: "active" } }, 0, 0, 20, 1_000);
    expect(idle.calls).toEqual([]);
  });

  it("is wired into both 2D tile passes of the runtime loop", () => {
    const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../client-runtime-loop.ts"), "utf8");
    expect(source.match(/drawSiphonOverlay2D\(deps\.ctx, t, px, py, size, Date\.now\(\)\)/g)).toHaveLength(2);
  });
});
