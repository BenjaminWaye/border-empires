import { describe, expect, test } from "vitest";
import {
  FORT_TIER_LADDER,
  SIEGE_TIER_LADDER,
  STRUCTURE_BUILD_MS,
  STRUCTURE_REMOVAL_MS,
  fortBuildDurationMs,
  fortRemovalDurationMs,
  siegeBatteryBuildDurationMs,
  siegeBatteryRemovalDurationMs,
  structureBuildDurationMs,
  structureBuildDurationMsForManpowerCost,
  structureRemovalDurationMs,
  structureRemovalDurationMsForManpowerCost
} from "./structure-costs.js";

// 2026-11-01: every structure that costs manpower builds in a flat minute and
// is torn down in a flat 30 seconds; manpower, not time, is the limit.
describe("structure build and removal duration", () => {
  test("builds take a flat minute and removals a flat 30 seconds", () => {
    expect(STRUCTURE_BUILD_MS).toBe(60_000);
    expect(STRUCTURE_REMOVAL_MS).toBe(30_000);
    expect(structureBuildDurationMs("HYDROGARDEN")).toBe(STRUCTURE_BUILD_MS);
    expect(structureBuildDurationMs("OBSERVATORY")).toBe(STRUCTURE_BUILD_MS);
    expect(structureRemovalDurationMs("HYDROGARDEN")).toBe(STRUCTURE_REMOVAL_MS);
    expect(structureRemovalDurationMs("OBSERVATORY")).toBe(STRUCTURE_REMOVAL_MS);
  });

  test("a structure that costs no manpower stays instant", () => {
    expect(structureBuildDurationMsForManpowerCost(0)).toBe(0);
    expect(structureRemovalDurationMsForManpowerCost(0)).toBe(0);
  });

  test("removal takes half as long as building", () => {
    expect(structureRemovalDurationMs("MANUFACTORY") * 2).toBe(structureBuildDurationMs("MANUFACTORY"));
  });

  test("a Relay Beacon's removal uses its full price, so it is never instant", () => {
    expect(structureRemovalDurationMs("RELAY_BEACON")).toBe(STRUCTURE_REMOVAL_MS);
  });

  test("every fort and siege tier builds and removes in the same flat time", () => {
    for (const tier of Object.values(FORT_TIER_LADDER)) {
      expect(fortBuildDurationMs(tier.variant)).toBe(STRUCTURE_BUILD_MS);
      expect(fortRemovalDurationMs(tier.variant)).toBe(STRUCTURE_REMOVAL_MS);
    }
    for (const tier of Object.values(SIEGE_TIER_LADDER)) {
      expect(siegeBatteryBuildDurationMs(tier.variant)).toBe(STRUCTURE_BUILD_MS);
      expect(siegeBatteryRemovalDurationMs(tier.variant)).toBe(STRUCTURE_REMOVAL_MS);
    }
  });
});
