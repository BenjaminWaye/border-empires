import { describe, expect, it } from "vitest";
import { createShoreWaterline } from "./client-map-3d-shore-waterline.js";

type Land = (x: number, z: number) => boolean;
const waterlineOf = (land: Land): ((x: number, z: number) => number) => createShoreWaterline(land, 100, 100, []);

// Share of sea tile (x0, z0) the fringe covers.
const sandCover = (land: Land, x0 = 0, z0 = 0): number => {
  const waterline = waterlineOf(land);
  let sand = 0;
  for (let z = 0.01; z < 1; z += 0.02) for (let x = 0.01; x < 1; x += 0.02) if (waterline(x0 + x, z0 + z) > 0) sand++;
  return sand / 2500;
};

describe("shore waterline", () => {
  it("never jumps: neighbouring points always get nearby values", () => {
    // The across-water limit used to hinge on which land square was nearest
    // and on hard side/corner flags, so the waterline jumped by up to ~0.7
    // along corner bisectors and tile edges -- straight, grid-aligned sand
    // edges and foam steps.
    let seed = 7;
    const rnd = (): number => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const size = 40;
    const grid = new Uint8Array(size * size);
    for (let i = 0; i < grid.length; i++) grid[i] = rnd() < 0.45 ? 1 : 0;
    const waterline = waterlineOf((x, z) => x >= 0 && z >= 0 && x < size && z < size && grid[z * size + x] === 1);
    let worst = 0;
    for (let k = 0; k < 40000; k++) {
      const x = 2 + rnd() * (size - 4);
      const z = 2 + rnd() * (size - 4);
      worst = Math.max(worst, Math.abs(waterline(x, z) - waterline(x + 0.002, z + 0.001)));
    }
    expect(worst).toBeLessThan(0.05);
  });

  it("keeps open water down the middle of a dead-end inlet", () => {
    // The end wall is the nearest land there; the two side banks still face
    // each other across the water and must keep it open.
    const deadEnd: Land = (x, z) => !(x === 0 && z >= 0);
    const waterline = waterlineOf(deadEnd);
    for (const z of [0.45, 0.5, 0.55, 1.5]) expect(waterline(0.5, z)).toBeLessThan(0);
  });

  it("keeps a one-tile lake a lake", () => {
    // ~90% sand once, leaving a tiny square pool.
    const lake: Land = (x, z) => !(x === 0 && z === 0);
    expect(waterlineOf(lake)(0.5, 0.5)).toBeLessThan(0);
    expect(sandCover(lake)).toBeLessThan(0.8);
  });

  it("keeps the full beach along a straight coast", () => {
    // The across-water limit must not mistake the land either side of the
    // tile beside a point for a far bank.
    const waterline = waterlineOf((_x, z) => z < 0);
    for (let x = 0.05; x < 4; x += 0.3) expect(waterline(x, 0.3)).toBeGreaterThan(0);
  });
});
