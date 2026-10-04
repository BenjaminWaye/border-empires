import { describe, expect, it } from "vitest";
import { drawPlanetaryDefenseOverlay } from "./client-map-render-planetary-defense-overlay.js";
import { PLANETARY_DEFENSE_ARMOR_COLOR } from "../client-planetary-defense-style.js";

// Records arc() centers (one per soldier helmet) and every fillStyle used.
const recordingCtx = () => {
  const helmets: Array<{ x: number; y: number }> = [];
  const fills: string[] = [];
  const noop = (): void => {};
  const ctx = {
    save: noop, restore: noop, beginPath: noop, moveTo: noop, lineTo: noop, closePath: noop,
    fill: noop, stroke: noop, fillRect: noop,
    arc: (x: number, y: number) => { helmets.push({ x, y }); },
    set fillStyle(value: string) { fills.push(value); },
    strokeStyle: "", lineWidth: 1, lineCap: "butt"
  } as unknown as CanvasRenderingContext2D;
  return { ctx, helmets, fills };
};

describe("drawPlanetaryDefenseOverlay (2D fallback)", () => {
  it("draws two dark-grey-armored soldiers on the tile", () => {
    const { ctx, helmets, fills } = recordingCtx();
    drawPlanetaryDefenseOverlay(ctx, 0, 0, 64, 3, 4, 1000);
    expect(helmets).toHaveLength(2);
    expect(fills).toContain(PLANETARY_DEFENSE_ARMOR_COLOR);
    for (const h of helmets) {
      expect(h.x).toBeGreaterThan(0);
      expect(h.x).toBeLessThan(64);
    }
  });

  it("patrols: the soldiers are in different places at different times", () => {
    const a = recordingCtx();
    const b = recordingCtx();
    drawPlanetaryDefenseOverlay(a.ctx, 0, 0, 64, 3, 4, 1000);
    drawPlanetaryDefenseOverlay(b.ctx, 0, 0, 64, 3, 4, 2500);
    expect(a.helmets).not.toEqual(b.helmets);
  });

  it("draws nothing when tiles are too small to read", () => {
    const { ctx, helmets } = recordingCtx();
    drawPlanetaryDefenseOverlay(ctx, 0, 0, 8, 3, 4, 1000);
    expect(helmets).toHaveLength(0);
  });
});
