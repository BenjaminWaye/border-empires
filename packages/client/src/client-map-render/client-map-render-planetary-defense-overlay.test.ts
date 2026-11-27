import { describe, expect, it } from "vitest";
import { drawPlanetaryDefenseOverlay } from "./client-map-render-planetary-defense-overlay.js";
import { PLANETARY_DEFENSE_ARMOR_COLOR } from "../client-planetary-defense-style.js";
import type { Tile } from "../client-types.js";

const camp = { x: 3, y: 4, terrain: "LAND", ownerId: "barbarian-1", ownershipState: "SETTLED" } as Tile;
const campLand = { ...camp, ownershipState: "FRONTIER" } as Tile;

// Records arc() centers (one per soldier helmet) and every fillStyle used.
const recordingCtx = () => {
  const helmets: Array<{ x: number; y: number }> = [];
  const fills: string[] = [];
  const noop = (): void => {};
  const ctx = {
    save: noop, restore: noop, beginPath: noop, moveTo: noop, lineTo: noop, closePath: noop, quadraticCurveTo: noop,
    fill: noop, stroke: noop, fillRect: noop,
    arc: (x: number, y: number) => { helmets.push({ x, y }); },
    set fillStyle(value: string) { fills.push(value); },
    strokeStyle: "", lineWidth: 1, lineCap: "butt", lineJoin: "miter", globalAlpha: 1
  } as unknown as CanvasRenderingContext2D;
  return { ctx, helmets, fills };
};

describe("drawPlanetaryDefenseOverlay (2D fallback)", () => {
  it("draws two dark-grey-armored soldiers on a camp tile", () => {
    const { ctx, helmets, fills } = recordingCtx();
    drawPlanetaryDefenseOverlay(ctx, camp, 0, 0, 64, 3, 4, 1000);
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
    drawPlanetaryDefenseOverlay(a.ctx, camp, 0, 0, 64, 3, 4, 1000);
    drawPlanetaryDefenseOverlay(b.ctx, camp, 0, 0, 64, 3, 4, 2500);
    expect(a.helmets).not.toEqual(b.helmets);
  });

  it("draws nothing when tiles are too small to read", () => {
    const { ctx, helmets } = recordingCtx();
    drawPlanetaryDefenseOverlay(ctx, camp, 0, 0, 8, 3, 4, 1000);
    expect(helmets).toHaveLength(0);
  });

  // Regression: soldiers stood on every Planetary Defense tile, so a camp looked the same as its frontier.
  it("draws no soldiers on a camp's frontier", () => {
    const { ctx, helmets } = recordingCtx();
    drawPlanetaryDefenseOverlay(ctx, campLand, 0, 0, 64, 3, 4, 1000);
    expect(helmets).toHaveLength(0);
  });

  // Regression: Insurgent frontier drew nothing at all, so it looked like empty terrain.
  it("stamps the cracked-shield insignia on a camp's frontier", () => {
    const { ctx, fills } = recordingCtx();
    drawPlanetaryDefenseOverlay(ctx, campLand, 0, 0, 64, 3, 4, 1000);
    expect(fills).toContain(PLANETARY_DEFENSE_ARMOR_COLOR);
  });

  it("draws no insignia on tiny tiles or when the ownership state is unknown", () => {
    for (const [tile, size] of [[campLand, 6], [(({ ownershipState: _omit, ...rest }) => rest as Tile)(campLand), 64]] as const) {
      const { ctx, fills } = recordingCtx();
      drawPlanetaryDefenseOverlay(ctx, tile, 0, 0, size, 3, 4, 1000);
      expect(fills).toHaveLength(0);
    }
  });
});
