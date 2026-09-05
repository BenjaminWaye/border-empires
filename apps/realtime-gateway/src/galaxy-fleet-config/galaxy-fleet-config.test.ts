import { describe, expect, it } from "vitest";
import {
  FLEET_BASE_TRAVEL_TIME_MS,
  computeFleetDamage,
  computeFleetProductionCost,
  computeFleetTravelTimeMs,
  isReconOnlyComposition,
  isValidFleetComposition
} from "./galaxy-fleet-config.js";

describe("isValidFleetComposition", () => {
  it("rejects an empty composition", () => {
    expect(isValidFleetComposition({})).toBe(false);
  });

  it("rejects a composition where every count is zero", () => {
    expect(isValidFleetComposition({ SCOUT: 0, RAIDER: 0 })).toBe(false);
  });

  it("rejects an unknown hull id", () => {
    expect(isValidFleetComposition({ ["FOO" as never]: 1 })).toBe(false);
  });

  it("rejects a negative or non-integer count", () => {
    expect(isValidFleetComposition({ RAIDER: -1 })).toBe(false);
    expect(isValidFleetComposition({ RAIDER: 1.5 })).toBe(false);
  });

  it("accepts a valid mixed composition", () => {
    expect(isValidFleetComposition({ RAIDER: 2, SCOUT: 1 })).toBe(true);
  });
});

describe("computeFleetProductionCost / computeFleetDamage", () => {
  it("matches §13's cost/damage table for a single Battleline", () => {
    expect(computeFleetProductionCost({ BATTLELINE: 1 })).toBe(200);
    expect(computeFleetDamage({ BATTLELINE: 1 })).toBe(200);
  });

  it("a Dreadnought delivers more damage than it costs (the doc's stated exception)", () => {
    expect(computeFleetDamage({ DREADNOUGHT: 1 })).toBeGreaterThan(computeFleetProductionCost({ DREADNOUGHT: 1 }));
  });

  it("sums across a mixed composition", () => {
    expect(computeFleetProductionCost({ RAIDER: 2, SCOUT: 1 })).toBe(80 * 2 + 25);
    expect(computeFleetDamage({ RAIDER: 2, SCOUT: 1 })).toBe(50 * 2);
  });

  it("Scouts and Tankers cost Production but deal zero damage", () => {
    expect(computeFleetDamage({ SCOUT: 3, TANKER: 2 })).toBe(0);
    expect(computeFleetProductionCost({ SCOUT: 3, TANKER: 2 })).toBeGreaterThan(0);
  });
});

describe("isReconOnlyComposition", () => {
  it("is true for a Scout-only composition", () => {
    expect(isReconOnlyComposition({ SCOUT: 2 })).toBe(true);
  });

  it("is false once any damage-dealing hull is present", () => {
    expect(isReconOnlyComposition({ SCOUT: 2, RAIDER: 1 })).toBe(false);
  });

  it("is false for an all-Tanker composition -- zero damage but no reveal-capable hull, so it's a true no-op, not a free recon", () => {
    expect(isReconOnlyComposition({ TANKER: 3 })).toBe(false);
  });

  it("is true for a Scout escorted by a Tanker", () => {
    expect(isReconOnlyComposition({ SCOUT: 1, TANKER: 1 })).toBe(true);
  });
});

describe("computeFleetTravelTimeMs", () => {
  it("a fleet travels at its slowest hull's speed", () => {
    const dreadnoughtOnly = computeFleetTravelTimeMs({ DREADNOUGHT: 1 });
    const mixedWithDreadnought = computeFleetTravelTimeMs({ DREADNOUGHT: 1, SCOUT: 5 });
    expect(mixedWithDreadnought).toBe(dreadnoughtOnly);
  });

  it("a Scout-only fleet is faster than a Dreadnought-only fleet", () => {
    expect(computeFleetTravelTimeMs({ SCOUT: 1 })).toBeLessThan(computeFleetTravelTimeMs({ DREADNOUGHT: 1 }));
  });

  it("a Dreadnought-only fleet takes the full base travel time (speed 1)", () => {
    expect(computeFleetTravelTimeMs({ DREADNOUGHT: 1 })).toBe(FLEET_BASE_TRAVEL_TIME_MS);
  });
});
