import { describe, expect, it } from "vitest";
import { createIncursionHillDrape } from "./client-map-3d-incursion-hill-drape.js";
import { tileSurfaceHeights } from "../client-map-3d-tile-surface-y/client-map-3d-tile-surface-y.js";

const RISE = 0.012;
const flatGround = { elevationAt: () => 0, cornerYAt: () => 0 };
const hillsEverywhere = { isHillsAt: () => true, wrapX: (x: number) => x, wrapY: (y: number) => y, roadDirsAt: () => undefined };
const drapeAt = createIncursionHillDrape({ cornerYAt: flatGround.cornerYAt, ...hillsEverywhere, hillCutAt: () => undefined, rise: RISE });

const highestPoint = (wx: number, wy: number): number => {
  const drape = drapeAt(wx, wy)!;
  let top = -Infinity;
  for (let b = 0; b <= 10; b += 1) for (let a = 0; a <= 10; a += 1) top = Math.max(top, drape(a / 10, b / 10));
  return top;
};

describe("createIncursionHillDrape", () => {
  it("leaves tiles that aren't hills to the flat hatch quad", () => {
    const drape = createIncursionHillDrape({ cornerYAt: () => 0, isHillsAt: () => false, wrapX: (x) => x, wrapY: (y) => y, hillCutAt: () => undefined, rise: RISE });
    expect(drape(3, 4)).toBeUndefined();
  });

  it("follows the corner ground at a hill tile's corners, where the dome has died away", () => {
    const drape = createIncursionHillDrape({ cornerYAt: (x, z) => (x === 11 && z === 21 ? 0.4 : 0.1), isHillsAt: (x, y) => x === 10 && y === 20, wrapX: (x) => x, wrapY: (y) => y, hillCutAt: () => undefined, rise: RISE })(10, 20)!;
    expect(drape(0, 0)).toBeCloseTo(0.1 + RISE + 0.012, 3);
    expect(drape(1, 1)).toBeCloseTo(0.4 + RISE + 0.012, 3);
  });

  it("rises above the flat height the hatch used to sit at, which the hill's bumps broke through", () => {
    // Regression: the hatch was one flat quad at flatOverlayY (the dome's height at the tile centre),
    // so wherever a bump stood taller than the centre it poked through the hatch.
    let brokeThrough = 0;
    for (let wx = 0; wx < 40; wx += 1) {
      const { flatOverlayY } = tileSurfaceHeights({ heightfield: flatGround, wx, wy: 7, wxNext: wx + 1, wyNext: 8, rise: RISE, ...hillsEverywhere });
      if (highestPoint(wx, 7) > flatOverlayY + 0.01) brokeThrough += 1;
    }
    expect(brokeThrough).toBeGreaterThan(0);
  });
});
