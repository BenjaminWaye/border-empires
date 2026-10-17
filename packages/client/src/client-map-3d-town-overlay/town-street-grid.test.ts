import { describe, expect, it } from "vitest";
import { createTownRandom } from "./town-mesh-builder.js";
import { insideOctagon } from "./town-parts.js";
import { planStreetGrid } from "./town-street-grid.js";
import { CITY_GRID, TOWN_GRID } from "./town-tier-small.js";

describe("street-grid towns", () => {
  it.each([["TOWN", TOWN_GRID], ["CITY", CITY_GRID]] as const)("%s keeps every building on the plate", (_name, spec) => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const plan = planStreetGrid(spec, createTownRandom(seed));
      for (const lot of plan.blocks.flatMap((block) => block.lots)) {
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
          expect(insideOctagon(lot.x + (sx * lot.w) / 2, lot.z + (sz * lot.d) / 2, plan.apothem), `seed ${seed}`).toBe(true);
        }
      }
    }
  });

  it.each([["TOWN", TOWN_GRID, 14], ["CITY", CITY_GRID, 24]] as const)("%s fills its blocks with buildings, streets between them", (_name, spec, minBuildings) => {
    const plan = planStreetGrid(spec, createTownRandom(7));
    const lots = plan.blocks.flatMap((block) => block.lots);
    expect(lots.length).toBeGreaterThanOrEqual(minBuildings);
    expect(plan.blocks.some((block) => block.park)).toBe(true);
    // Lots never cross into the street round their block.
    for (const block of plan.blocks) {
      for (const lot of block.lots) {
        expect(Math.abs(lot.x - block.x) + lot.w / 2).toBeLessThanOrEqual(block.size / 2);
        expect(Math.abs(lot.z - block.z) + lot.d / 2).toBeLessThanOrEqual(block.size / 2);
      }
    }
  });

  it("raises a glass downtown in the city", () => {
    const lots = planStreetGrid(CITY_GRID, createTownRandom(37)).blocks.flatMap((block) => block.lots);
    expect(lots.filter((lot) => lot.allGlass).length).toBeGreaterThanOrEqual(4);
  });
});
