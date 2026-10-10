import { describe, expect, test } from "vitest";
import {
  FORT_TIER_LADDER,
  SIEGE_TIER_LADDER,
  fortBuildDurationMs,
  fortRemovalDurationMs,
  siegeOutpostBuildDurationMs,
  siegeOutpostRemovalDurationMs,
  structureBuildDurationMs,
  structureBuildManpowerCost,
  structureRemovalDurationMs
} from "./structure-costs.js";

// 2026-10-10: building costs 1s per manpower point, removal 0.5s per point of
// the structure being torn down (replacing the flat FORT_BUILD_MS-style timers).
describe("structure removal duration", () => {
  test("removal is 0.5s per manpower point", () => {
    expect(structureRemovalDurationMs("FARMSTEAD")).toBe(structureBuildManpowerCost("FARMSTEAD") * 500);
    expect(structureRemovalDurationMs("OBSERVATORY")).toBe(structureBuildManpowerCost("OBSERVATORY") * 500);
  });

  test("removal takes half as long as building", () => {
    expect(structureRemovalDurationMs("MINTWORKS") * 2).toBe(structureBuildDurationMs("MINTWORKS"));
  });

  test("a Relay Beacon's removal uses its full price, so it is never instant", () => {
    expect(structureRemovalDurationMs("RELAY_BEACON")).toBe(structureBuildManpowerCost("RELAY_BEACON") * 500);
    expect(structureRemovalDurationMs("RELAY_BEACON")).toBeGreaterThan(0);
  });

  test("fort and siege tiers build and remove on their own tier's manpower", () => {
    for (const tier of Object.values(FORT_TIER_LADDER)) {
      expect(fortBuildDurationMs(tier.variant)).toBe(tier.manpower * 1_000);
      expect(fortRemovalDurationMs(tier.variant)).toBe(tier.manpower * 500);
    }
    for (const tier of Object.values(SIEGE_TIER_LADDER)) {
      expect(siegeOutpostBuildDurationMs(tier.variant)).toBe(tier.manpower * 1_000);
      expect(siegeOutpostRemovalDurationMs(tier.variant)).toBe(tier.manpower * 500);
    }
  });
});
