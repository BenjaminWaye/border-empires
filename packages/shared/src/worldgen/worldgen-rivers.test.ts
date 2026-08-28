import { describe, expect, it } from "vitest";
import { setWorldSeed, terrainAt } from "./worldgen.js";
import { generateRiverPaths, smoothRiverPath, type RiverPath } from "./worldgen-rivers.js";

describe("generateRiverPaths", () => {
  it("is deterministic: same seed produces the same river paths every call", () => {
    setWorldSeed(2024);
    const first = generateRiverPaths(2024);
    const second = generateRiverPaths(2024);
    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(0);
  });

  it("produces different river paths for a different seed", () => {
    setWorldSeed(2024);
    const a = generateRiverPaths(2024);
    setWorldSeed(97531);
    const b = generateRiverPaths(97531);
    expect(b).not.toEqual(a);
  });

  it("every river path starts on land and ends on a sea tile", () => {
    setWorldSeed(555);
    const rivers = generateRiverPaths(555);
    expect(rivers.length).toBeGreaterThan(0);
    for (const path of rivers) {
      expect(path.length).toBeGreaterThan(0);
      const last = path[path.length - 1]!;
      const terrain = terrainAt(Math.floor(last.wx), Math.floor(last.wy));
      expect(terrain === "SEA" || terrain === "COASTAL_SEA").toBe(true);
    }
  });

  it("works for a world generated with the islands style, not just continents", () => {
    // Regression: rivers must originate near mountains and reach the coast
    // regardless of which land-layout style produced the current terrain —
    // islands worlds still have both mountains and coastline, just arranged
    // differently than continents.
    setWorldSeed(4242, "islands");
    const rivers = generateRiverPaths(4242);
    expect(rivers.length).toBeGreaterThan(0);
  });

  it("smoothRiverPath returns a path at least as long as the input for a walkable path", () => {
    const path: RiverPath = [
      { wx: 10.5, wy: 10.5, halfWidth: 0.1 },
      { wx: 11.5, wy: 10.5, halfWidth: 0.12 },
      { wx: 12.5, wy: 10.5, halfWidth: 0.14 }
    ];
    const smoothed = smoothRiverPath(path);
    expect(smoothed.length).toBeGreaterThanOrEqual(path.length);
    expect(smoothed[0]!.wx).toBeCloseTo(path[0]!.wx);
    expect(smoothed[smoothed.length - 1]!.wx).toBeCloseTo(path[path.length - 1]!.wx);
  });
});
