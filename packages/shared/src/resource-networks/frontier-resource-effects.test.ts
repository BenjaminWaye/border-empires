import { describe, expect, it } from "vitest";
import {
  allocateBiotaSlots, biotaManpowerTier, biotaSlotsNeededForTier, frontierSiteCaptureValue,
  salvageArmsMultiplier, salvageLoadsRemaining, salvageTributeManpower
} from "./frontier-resource-effects.js";

describe("luxury biota", () => {
  it("needs one slot per tier above Town", () => {
    expect((["SETTLEMENT", "TOWN", "CITY", "GREAT_CITY", "METROPOLIS"] as const).map(biotaSlotsNeededForTier)).toEqual([0, 0, 1, 2, 3]);
  });
  it("lifts a starving town one manpower tier per slot, from Town to its real tier", () => {
    expect([0, 1, 2, 3, 9].map(slots => biotaManpowerTier("METROPOLIS", slots))).toEqual(["TOWN", "CITY", "GREAT_CITY", "METROPOLIS", "METROPOLIS"]);
    expect(biotaManpowerTier("CITY", 0)).toBe("TOWN");
    expect(biotaManpowerTier("TOWN", 0)).toBe("TOWN");
    expect(biotaManpowerTier("SETTLEMENT", 0)).toBe("SETTLEMENT");
  });
  it("supplies the longest-held towns first so a fresh capture never starves older towns", () => {
    const allocation = allocateBiotaSlots([
      { key: "captured-metro", tier: "METROPOLIS", heldSince: 500 },
      { key: "home-city-b", tier: "CITY", heldSince: 100 },
      { key: "home-city-a", tier: "CITY", heldSince: 100 },
      { key: "small", tier: "TOWN", heldSince: 0 }
    ], 3);
    expect(allocation.get("home-city-a")).toEqual({ received: 1, needed: 1, manpowerTier: "CITY" });
    expect(allocation.get("home-city-b")).toEqual({ received: 1, needed: 1, manpowerTier: "CITY" });
    expect(allocation.get("captured-metro")).toEqual({ received: 1, needed: 3, manpowerTier: "CITY" });
    expect(allocation.has("small")).toBe(false);
  });
});

describe("precursor salvage", () => {
  it("holds three loads per tile", () => {
    expect(salvageLoadsRemaining({})).toBe(3);
    expect(salvageLoadsRemaining({ salvageLoadsShipped: 2 })).toBe(1);
    expect(salvageLoadsRemaining({ salvageLoadsShipped: 7 })).toBe(0);
  });
  it("gives +1% attack and defense per site up to +10%", () => {
    expect(salvageArmsMultiplier(0)).toBe(1);
    expect(salvageArmsMultiplier(4)).toBeCloseTo(1.04);
    expect(salvageArmsMultiplier(25)).toBeCloseTo(1.1);
  });
  it("delivers a quarter of the manpower cap per load, never above the cap", () => {
    expect(salvageTributeManpower(0, 1000)).toBe(250);
    expect(salvageTributeManpower(900, 1000)).toBe(100);
    expect(salvageTributeManpower(1000, 1000)).toBe(0);
  });
  it("describes what capturing one more site adds", () => {
    expect(frontierSiteCaptureValue("LUXURY_BIOTA", 2)).toBe("+2 biota slots");
    expect(frontierSiteCaptureValue("PRECURSOR_SALVAGE", 10)).toBe("+0% (arms bonus at its +10% limit)");
  });
});
