import { describe, expect, it } from "vitest";
import { riverEdgeKeysForCurrentSeed, setWorldSeed, WORLD_WIDTH } from "@border-empires/shared";
import { drawLiveOwnershipTint2D, liveOwnershipTintAlpha } from "./client-map-render-live-ownership-tint.js";

type Fill = { style: string; alpha: number };
const recordingCtx = (): { ctx: CanvasRenderingContext2D; fills: Fill[] } => {
  const fills: Fill[] = [];
  const ctx = {
    fillStyle: "",
    globalAlpha: 1,
    fillRect(): void {
      fills.push({ style: String(this.fillStyle), alpha: this.globalAlpha });
    }
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, fills };
};

describe("2D live ownership tint", () => {
  it("keeps the tint opacities it had inside client-runtime-loop.ts", () => {
    expect(liveOwnershipTintAlpha({ ownershipState: "SETTLED" }, 0)).toBe(0.92);
    expect(liveOwnershipTintAlpha({ ownershipState: "FRONTIER" }, 0)).toBe(0.2);
    expect(liveOwnershipTintAlpha({ ownershipState: "SETTLED", breachShockUntil: 10 }, 0)).toBe(0.62);
  });

  it("redraws the river bank and water over the territory tint, so a river inside territory stays visible", () => {
    // Regression: the 0.92 owner fill was drawn after the river and hid it.
    setWorldSeed(555, "continents", 9);
    const [key] = riverEdgeKeysForCurrentSeed();
    expect(key).toBeDefined();
    const cell = Math.floor(key! / 2);
    const wx = cell % WORLD_WIDTH;
    const wy = Math.floor(cell / WORLD_WIDTH);
    const { ctx, fills } = recordingCtx();
    drawLiveOwnershipTint2D(ctx, { ownershipState: "SETTLED" }, "#ff0000", wx, wy, 0, 0, 40, 0);
    expect(fills[0]).toEqual({ style: "#ff0000", alpha: 0.92 });
    const after = fills.slice(1);
    expect(after.length).toBeGreaterThan(0);
    // Bank and water bands over the territory, at full canvas alpha (the
    // bank keeps the river reading as cut into the land -- option A).
    expect(after.every((f) => (f.style.startsWith("rgba(22, 72, 96") || f.style.startsWith("rgba(28, 26, 18")) && f.alpha === 1)).toBe(true);
    expect(after.some((f) => f.style.startsWith("rgba(22, 72, 96"))).toBe(true);
    expect(after.some((f) => f.style.startsWith("rgba(28, 26, 18"))).toBe(true);
  });
});
