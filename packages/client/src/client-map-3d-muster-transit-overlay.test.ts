import { describe, expect, it } from "vitest";
import { companyFormation, tileWalkPath } from "./client-map-3d-muster-transit-overlay.js";
import { squadUnitsFor, UNIT_PROFILES } from "./client-map-3d-popup-marine/popup-marine-units.js";

describe("tileWalkPath", () => {
  it("walks a straight horizontal line one tile at a time", () => {
    const path = tileWalkPath(0, 0, 4, 0);
    expect(path).toEqual([
      { x: 0, z: 0 }, { x: 1, z: 0 }, { x: 2, z: 0 }, { x: 3, z: 0 }, { x: 4, z: 0 }
    ]);
  });

  it("walks diagonally (king-move) when both axes differ, never skipping a tile", () => {
    const path = tileWalkPath(0, 0, 3, 3);
    expect(path).toEqual([
      { x: 0, z: 0 }, { x: 1, z: 1 }, { x: 2, z: 2 }, { x: 3, z: 3 }
    ]);
  });

  it("staircases when one axis is longer than the other, never leaving a >1-tile gap between consecutive points", () => {
    const path = tileWalkPath(0, 0, 5, 2);
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1]!, b = path[i]!;
      expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z))).toBe(1);
    }
    expect(path[0]).toEqual({ x: 0, z: 0 });
    expect(path[path.length - 1]).toEqual({ x: 5, z: 2 });
  });

  it("falls back to a straight two-point line when the walk would exceed maxSteps", () => {
    const path = tileWalkPath(0, 0, 100, 0, 10);
    expect(path).toEqual([{ x: 0, z: 0 }, { x: 100, z: 0 }]);
  });

  it("returns a single-point path when start and end coincide", () => {
    expect(tileWalkPath(5, 5, 5, 5)).toEqual([{ x: 5, z: 5 }]);
  });
});

describe("companyFormation", () => {
  it("marches plain infantry for an empire with no weapons factory", () => {
    expect(companyFormation(undefined, 3)).toEqual(Array(7).fill("infantry"));
  });

  it("puts the titanium walkers at the head and tail of the column, with the rest of the squad between", () => {
    for (let seed = 0; seed < 40; seed++) {
      const company = companyFormation({ titanium: true, umbrite: true }, seed);
      expect(company).toHaveLength(7);
      expect(UNIT_PROFILES[company[0]!].scale).toBeGreaterThan(1);
      expect(UNIT_PROFILES[company[6]!].scale).toBeGreaterThan(1);
      expect(company.filter((u) => u === "umbrite-heavy")).toHaveLength(2);
      // The same squad the battle overlay would field, just reordered.
      expect([...company].sort()).toEqual([...squadUnitsFor({ titanium: true, umbrite: true }, seed, 0)].sort());
    }
  });
});
