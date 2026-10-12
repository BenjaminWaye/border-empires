import { describe, expect, it } from "vitest";
import { mountainVariationAt, type MountainNeighbourhood } from "../client-map-mountain-variation/client-map-mountain-variation.js";
import { mountainPeaksLayout } from "./client-map-render-mountain-peaks.js";

const LONE: MountainNeighbourhood = { north: false, east: false, south: false, west: false, cold: false };

describe("2D mountain peaks layout", () => {
  it("matches the 3D variation: twin peak decisions agree, and the snow it is given caps the main peak", () => {
    for (let x = 0; x < 25; x += 1) {
      for (let y = 0; y < 25; y += 1) {
        const v = mountainVariationAt(x, y, LONE);
        const layout = mountainPeaksLayout(x, y, LONE, { snow: (x + y) % 2 === 0 });
        expect(layout.peaks.length).toBe(v.secondary ? 2 : 1);
        expect(layout.peaks[layout.peaks.length - 1]!.snow).toBe((x + y) % 2 === 0);
      }
    }
    // Without a snow decision, only cold country is snowy.
    expect(mountainPeaksLayout(3, 4, LONE).peaks.at(-1)!.snow).toBe(false);
    expect(mountainPeaksLayout(3, 4, { ...LONE, cold: true }).peaks.at(-1)!.snow).toBe(true);
  });

  it("keeps every peak apex inside the tile and above its base", () => {
    for (let x = 0; x < 25; x += 1) {
      for (let y = 0; y < 25; y += 1) {
        for (const peak of mountainPeaksLayout(x, y, { ...LONE, north: true, east: true }).peaks) {
          expect(peak.apex.y).toBeGreaterThan(0);
          expect(peak.apex.y).toBeLessThan(peak.baseLeft.y);
          expect(peak.apex.x).toBeGreaterThan(0);
          expect(peak.apex.x).toBeLessThan(1);
        }
      }
    }
  });

  it("varies peak height between tiles", () => {
    const heights = new Set<number>();
    for (let i = 0; i < 20; i += 1) {
      const main = mountainPeaksLayout(i, i * 3, LONE).peaks.at(-1)!;
      heights.add(Math.round((main.baseLeft.y - main.apex.y) * 1000));
    }
    expect(heights.size).toBeGreaterThan(8);
  });

  it("draws a ridge half toward each mountain neighbour, none when alone", () => {
    expect(mountainPeaksLayout(3, 3, LONE).ridges).toEqual([]);
    expect(mountainPeaksLayout(3, 3, { ...LONE, west: true, south: true }).ridges.map((r) => r.toward)).toEqual(["south", "west"]);
  });
});
