import { describe, expect, test } from "vitest";
import { ciede2000Lab } from "./ciede2000.js";
import {
  MIN_EMPIRE_COLOR_DELTA_E,
  areEmpireColorsTooClose,
  closestClashingEmpire,
  empireColorDistance,
  hexToLab,
  isEmpireColorFarEnough,
  tooCloseColorReason
} from "./empire-color-distance.js";

describe("CIEDE2000", () => {
  // Reference pairs from Sharma, Wu & Dalal (2005), table 1.
  test.each([
    [{ l: 50, a: 2.6772, b: -79.7751 }, { l: 50, a: 0, b: -82.7485 }, 2.0425],
    [{ l: 50, a: 2.5, b: 0 }, { l: 50, a: 0, b: -2.5 }, 4.3065],
    [{ l: 50, a: 2.5, b: 0 }, { l: 73, a: 25, b: -18 }, 27.1492],
    [{ l: 60.2574, a: -34.0099, b: 36.2677 }, { l: 60.4626, a: -34.1751, b: 39.4387 }, 1.2644],
    [{ l: 22.7233, a: 20.0904, b: -46.694 }, { l: 23.0331, a: 14.973, b: -42.5619 }, 2.0373],
    [{ l: 2.0776, a: 0.0795, b: -1.135 }, { l: 0.9033, a: -0.0636, b: -0.5514 }, 0.9082]
  ])("matches the published test data %#", (x, y, expected) => {
    expect(ciede2000Lab(x, y)).toBeCloseTo(expected, 3);
    expect(ciede2000Lab(y, x)).toBeCloseTo(expected, 3);
  });

  test("sRGB to Lab matches known values", () => {
    const white = hexToLab("#ffffff");
    expect(white.l).toBeCloseTo(100, 2);
    expect(white.a).toBeCloseTo(0, 2);
    const red = hexToLab("#ff0000");
    expect(red.l).toBeCloseTo(53.24, 1);
    expect(red.a).toBeCloseTo(80.09, 1);
    expect(red.b).toBeCloseTo(67.2, 1);
  });

  test("identical colours are 0 apart", () => {
    expect(empireColorDistance("#fabebe", "#fabebe")).toBe(0);
  });
});

describe("minimum empire colour distance", () => {
  test("the playtest's two pale pinks are too close", () => {
    expect(empireColorDistance("#fabebe", "#f7b6d2")).toBeLessThan(MIN_EMPIRE_COLOR_DELTA_E);
    expect(areEmpireColorsTooClose("#fabebe", "#f7b6d2")).toBe(true);
  });

  test("clearly different colours pass", () => {
    expect(areEmpireColorsTooClose("#ff0000", "#1f77b4")).toBe(false);
    expect(isEmpireColorFarEnough("#ff0000", ["#1f77b4", "#39ff14"])).toBe(true);
    expect(isEmpireColorFarEnough("#ff0000", ["#1f77b4", "#ff0f0f"])).toBe(false);
  });

  test("closestClashingEmpire returns the nearest clash only", () => {
    const empires = [
      { playerId: "a", name: "Far", color: "#1f77b4" },
      { playerId: "b", name: "Near", color: "#fabebe" },
      { playerId: "c", name: "Nearer", color: "#f8bcc4" }
    ];
    expect(closestClashingEmpire("#f7b6d2", empires)?.name).toBe("Nearer");
    expect(closestClashingEmpire("#39ff14", empires)).toBeUndefined();
  });

  test("terse reasons", () => {
    expect(tooCloseColorReason("Rosa")).toBe("Too close to Rosa's colour.");
    expect(tooCloseColorReason("House Silas")).toBe("Too close to House Silas' colour.");
    expect(tooCloseColorReason(undefined)).toBe("Too close to another empire's colour.");
  });
});
