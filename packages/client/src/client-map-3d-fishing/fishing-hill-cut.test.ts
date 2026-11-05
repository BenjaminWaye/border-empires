import { describe, expect, it, vi } from "vitest";
import { InstancedMesh, Matrix4, Scene, Vector3 } from "three";
import { hillBumpsAt, hillShapeHeight } from "../client-map-3d-hill-shape.js";
import { createHillCutLookup } from "../client-map-3d-afc-hill-cut/client-map-3d-afc-hill-cut.js";
import { buildFishingPadIndex, fishingHillCutMask, FISHING_HILL_CUT_FADE_RADIUS, FISHING_HILL_CUT_FULL_RADIUS } from "./fishing-hill-cut.js";
import { createFishingOverlay, FISHING_SEAT_RISE } from "./client-map-3d-fishing.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;
const ident = (v: number): number => v;
// A FISH hill at (10, 10) with the sea to its east.
const fishHill = { x: 10, y: 10, terrain: "LAND", resource: "FISH" };
const index = (overrides: Partial<Parameters<typeof buildFishingPadIndex>[0]> = {}) => buildFishingPadIndex({
  tiles: [fishHill], keyFor, wrapX: ident, wrapY: ident,
  isHillsAt: () => true, isWaterAt: (x) => x >= 11, isSiteDrawnAt: () => true, ...overrides
});

describe("fishingHillCutMask", () => {
  it("is flat under the apron and fades back to the dome", () => {
    const pads = [{ du: 0.132, dv: 0 }];
    expect(fishingHillCutMask(0.132 + FISHING_HILL_CUT_FULL_RADIUS - 0.01, 0, pads)).toBe(1);
    expect(fishingHillCutMask(0.132 - FISHING_HILL_CUT_FADE_RADIUS - 0.01, 0, pads)).toBe(0);
    const mid = fishingHillCutMask(0.132 - (FISHING_HILL_CUT_FULL_RADIUS + FISHING_HILL_CUT_FADE_RADIUS) / 2, 0, pads);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(fishingHillCutMask(0, 0, undefined)).toBe(0);
  });
});

describe("buildFishingPadIndex", () => {
  it("registers the site's pad, offset toward the water, on its 3x3 neighbourhood", () => {
    const pads = index();
    expect(pads.size).toBe(9);
    expect(pads.get("10,10")).toEqual([{ du: 0.132, dv: 0 }]);
    expect(pads.get("9,10")![0]!.du).toBeCloseTo(1.132, 10);
    expect(pads.get("11,11")![0]!.du).toBeCloseTo(0.132 - 1, 10);
    expect(pads.get("11,11")![0]!.dv).toBe(-1);
  });

  it("cuts nothing where no live fishing site is drawn", () => {
    expect(index({ isHillsAt: () => false }).size).toBe(0);
    expect(index({ isSiteDrawnAt: () => false }).size).toBe(0); // fogged: no site, so no empty notch
    expect(index({ tiles: [{ ...fishHill, resource: "FARM" }] }).size).toBe(0);
  });

  it("levels the hill dome under the site through the shared hill-cut lookup", () => {
    const hillCutAt = createHillCutLookup(() => undefined, new Map(), keyFor, index());
    const bumps = hillBumpsAt(10, 10);
    expect(hillShapeHeight(0, 0, bumps, 10, 10)).toBeGreaterThan(0.1);
    expect(hillShapeHeight(0, 0, bumps, 10, 10, hillCutAt(10, 10))).toBe(0);
    expect(hillCutAt(30, 30)).toBeUndefined();
  });
});

describe("createFishingOverlay seat", () => {
  it("seats a site on the highest corner of its levelled pad, not a buried mean", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined); // the glb is not served in tests
    const scene = new Scene();
    // Land corners high (west), coast corners low (east).
    const overlay = createFishingOverlay(scene, 4, undefined, (wx) => (wx <= 10 ? 0.18 : -0.04));
    const meanY = (0.18 * 2 - 0.04 * 2) / 4 + FISHING_SEAT_RISE;
    overlay.addInstance(0.5, 0.5, meanY, 10, 10, { dx: 1, dy: 0 });
    overlay.commit();
    const apron = scene.children.find((c): c is InstancedMesh => c instanceof InstancedMesh && c.name === "fishing-clean-apron")!;
    const m = new Matrix4(); apron.getMatrixAt(0, m);
    expect(new Vector3().setFromMatrixPosition(m).y).toBeCloseTo(0.18 + FISHING_SEAT_RISE + 0.003, 6);
    overlay.dispose();
  });
});
