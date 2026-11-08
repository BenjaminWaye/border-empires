import { describe, expect, it } from "vitest";
import { NO_MOUTH_CUT, riverMouthCutDistance, withSeaDirections } from "./client-map-3d-shore-river-mouth.js";
import { createShoreWaterline } from "./client-map-3d-shore-waterline.js";

// Land west of x = 0, sea east of it; a river reaches the coast along the
// tile border z = 0 and runs out to sea (+x) from the corner (0, 0).
const westLand = (x: number): boolean => x < 0;
const mouths = withSeaDirections([{ x: 0, z: 0 }], westLand);
const waterline = createShoreWaterline(westLand, 100, 100, mouths);
const plainWaterline = createShoreWaterline(westLand, 100, 100, []);

describe("river mouth through the beach fringe", () => {
  it("points each mouth out to sea", () => {
    expect(mouths).toHaveLength(1);
    expect(mouths[0]!.dx).toBeCloseTo(1);
    expect(mouths[0]!.dz).toBeCloseTo(0);
    // A corner with no sea round it has nowhere to point: dropped.
    expect(withSeaDirections([{ x: -5, z: 0 }], westLand)).toHaveLength(0);
  });

  it("keeps the river its full width where it crosses the coast", () => {
    // The fringe used to pinch in a circle round the corner, so sand still
    // stood right beside it along the coast: the river squeezed through a
    // neck there and flared out into a funnel beyond. Across the water's
    // width (~0.29 at the coast) there is no sand at any point out to sea.
    for (const along of [0.02, 0.1, 0.25, 0.4, 0.6]) {
      for (const across of [-0.27, -0.15, 0, 0.15, 0.27]) expect(waterline(along, across)).toBeLessThan(0);
    }
  });

  it("starts the beach where the land's own river banks end, with no tooth into the river", () => {
    // The land's banks rise to dry ground ~0.4 from the river's centre at
    // the coast (estuary-flared channel + bank). A cut only 0.3 wide left a
    // sand tooth sticking into the river on each side, past the land's bank.
    for (const across of [-0.36, 0.36]) expect(waterline(0.02, across)).toBeLessThan(0);
  });

  it("runs the banks alongside the river instead of slanting them into a wedge", () => {
    // A little way beside the river the beach still reaches out to sea
    // (sand at every point the open coast has it), and well clear of the
    // channel it is exactly the open coast's.
    for (const across of [-0.6, 0.6]) {
      for (const along of [0.05, 0.2, 0.3]) expect(waterline(along, across)).toBeGreaterThan(0);
    }
    for (const along of [0.05, 0.2, 0.3]) expect(waterline(along, 1.2)).toBeCloseTo(plainWaterline(along, 1.2), 6);
  });

  it("leaves the coast untouched away from the river", () => {
    expect(riverMouthCutDistance(0.2, 3, mouths)).toBe(NO_MOUTH_CUT);
    for (const across of [1.2, 3]) expect(waterline(0.2, across)).toBe(plainWaterline(0.2, across));
  });

  it("is continuous across the cut's edges and range", () => {
    // Straight coast and a diagonal mouth (sea in one tile, ahead and to
    // the right of the corner), whose cut runs out at 45 degrees. The cut
    // adds no step: the waterline changes between neighbouring points no
    // faster than the open coast's own does (it falls steeply into open water).
    const sw = (x: number, z: number): boolean => x < 0 || z < 0;
    const steepest = (line: (x: number, z: number) => number): number => {
      let worst = 0;
      for (let z = -3; z <= 3; z += 0.01) {
        for (let x = -0.2; x <= 3; x += 0.05) {
          worst = Math.max(worst, Math.abs(line(x, z + 0.01) - line(x, z)), Math.abs(line(z + 0.01, x) - line(z, x)));
        }
      }
      return worst;
    };
    for (const land of [westLand, sw]) {
      const withMouth = createShoreWaterline(land, 100, 100, withSeaDirections([{ x: 0, z: 0 }], land));
      expect(steepest(withMouth)).toBeLessThanOrEqual(steepest(createShoreWaterline(land, 100, 100, [])) + 1e-9);
    }
  });

  it("stops short of the far shore of a narrow inlet", () => {
    // Land again two tiles out: the river's cut must not slice its beach.
    const inlet = (x: number): boolean => x < 0 || x >= 2;
    const across = createShoreWaterline(inlet, 100, 100, withSeaDirections([{ x: 0, z: 0 }], inlet));
    const plain = createShoreWaterline(inlet, 100, 100, []);
    expect(across(1.9, 0)).toBe(plain(1.9, 0));
  });
});
