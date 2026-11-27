import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { drawPlanetaryDefenseOverlay } from "./client-map-render-planetary-defense-overlay.js";
import { PLANETARY_DEFENSE_ARMOR_COLOR } from "../client-planetary-defense-style.js";
import type { Tile } from "../client-types.js";

const camp = { x: 3, y: 4, terrain: "LAND", ownerId: "barbarian-1", ownershipState: "SETTLED" } as Tile;
const campLand = { ...camp, ownershipState: "FRONTIER" } as Tile;

// Node has no DOM canvas: a stand-in lets the shared mark sprite be "painted" once.
const fakeSprite = { width: 128, height: 128, getContext: () => ({
  save: () => {}, restore: () => {}, translate: () => {}, scale: () => {}, beginPath: () => {}, moveTo: () => {}, lineTo: () => {},
  quadraticCurveTo: () => {}, closePath: () => {}, fill: () => {}, stroke: () => {}, fillRect: () => {}
}) };
beforeAll(() => {
  vi.stubGlobal("document", { createElement: () => fakeSprite });
});
afterAll(() => {
  vi.unstubAllGlobals();
});

// Records arc() centers (one per soldier helmet) and every fillStyle used.
const recordingCtx = () => {
  const helmets: Array<{ x: number; y: number }> = [];
  const fills: string[] = [];
  const images: Array<{ image: unknown; x: number; y: number; w: number; h: number }> = [];
  const noop = (): void => {};
  const ctx = {
    save: noop, restore: noop, beginPath: noop, moveTo: noop, lineTo: noop, closePath: noop, quadraticCurveTo: noop,
    fill: noop, stroke: noop, fillRect: noop,
    drawImage: (image: unknown, x: number, y: number, w: number, h: number) => { images.push({ image, x, y, w, h }); },
    arc: (x: number, y: number) => { helmets.push({ x, y }); },
    set fillStyle(value: string) { fills.push(value); },
    strokeStyle: "", lineWidth: 1, lineCap: "butt", lineJoin: "miter", globalAlpha: 1
  } as unknown as CanvasRenderingContext2D;
  return { ctx, helmets, fills, images };
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
  it("stamps the raised-fist mark, centred, on a camp's frontier", () => {
    const { ctx, images, helmets } = recordingCtx();
    drawPlanetaryDefenseOverlay(ctx, campLand, 0, 0, 64, 3, 4, 1000);
    expect(images).toHaveLength(1);
    expect(images[0]!.image).toBe(fakeSprite);
    expect(images[0]!.x + images[0]!.w / 2).toBeCloseTo(32);
    expect(images[0]!.y + images[0]!.h / 2).toBeCloseTo(32);
    expect(images[0]!.w).toBeGreaterThan(0);
    expect(images[0]!.w).toBeLessThan(64);
    expect(helmets).toHaveLength(0);
  });

  it("puts no mark on a camp (it has soldiers)", () => {
    const { ctx, images } = recordingCtx();
    drawPlanetaryDefenseOverlay(ctx, camp, 0, 0, 64, 3, 4, 1000);
    expect(images).toHaveLength(0);
  });

  it("draws no mark on tiny tiles or when the ownership state is unknown", () => {
    for (const [tile, size] of [[campLand, 11], [(({ ownershipState: _omit, ...rest }) => rest as Tile)(campLand), 64]] as const) {
      const { ctx, images } = recordingCtx();
      drawPlanetaryDefenseOverlay(ctx, tile, 0, 0, size, 3, 4, 1000);
      expect(images).toHaveLength(0);
    }
  });

  // Review: the 2D mark was painted over the tile's resource/town/structure icon.
  it("steps aside on a tile that already shows its own icon", () => {
    for (const extra of [{ resource: "IRON" }, { town: {} }, { dockId: "d1" }, { fort: {} }, { economicStructure: {} }]) {
      const { ctx, images } = recordingCtx();
      drawPlanetaryDefenseOverlay(ctx, { ...campLand, ...extra } as unknown as Tile, 0, 0, 64, 3, 4, 1000);
      expect(images).toHaveLength(0);
    }
  });
});
