import { describe, expect, it } from "vitest";
import {
  allocateBiotaSlots, biotaManpowerTier, biotaSlotsNeededForTier, biotaSlotsNeededFromSites, frontierSiteCaptureValue,
  salvageArmsMultiplier, salvageLoadsRemaining, salvageTributeManpower
} from "./frontier-resource-effects.js";

describe("luxury biota", () => {
  it("needs more slots at each tier than the one before: City 1, Great City 3, Metropolis 6", () => {
    expect((["SETTLEMENT", "TOWN", "CITY", "GREAT_CITY", "METROPOLIS"] as const).map(biotaSlotsNeededForTier)).toEqual([0, 0, 1, 3, 6]);
  });
  it("works as the highest tier, up to its real one, whose biota need its slots meet", () => {
    expect([0, 1, 2, 3, 5, 6, 9].map(slots => biotaManpowerTier("METROPOLIS", slots)))
      .toEqual(["TOWN", "CITY", "CITY", "GREAT_CITY", "GREAT_CITY", "METROPOLIS", "METROPOLIS"]);
    expect([0, 1, 2, 3].map(slots => biotaManpowerTier("GREAT_CITY", slots))).toEqual(["TOWN", "CITY", "CITY", "GREAT_CITY"]);
    expect(biotaManpowerTier("CITY", 0)).toBe("TOWN");
    expect(biotaManpowerTier("CITY", 5)).toBe("CITY");
    expect(biotaManpowerTier("TOWN", 0)).toBe("TOWN");
    expect(biotaManpowerTier("SETTLEMENT", 0)).toBe("SETTLEMENT");
  });
  it("supplies the longest-held towns first so a fresh capture never starves older towns", () => {
    const allocation = allocateBiotaSlots([
      { key: "captured-metro", tier: "METROPOLIS", heldSince: 500 },
      { key: "home-city-b", tier: "CITY", heldSince: 100 },
      { key: "home-city-a", tier: "CITY", heldSince: 100 },
      { key: "small", tier: "TOWN", heldSince: 0 }
    ], 5);
    expect(allocation.get("home-city-a")).toEqual({ received: 1, needed: 1, manpowerTier: "CITY" });
    expect(allocation.get("home-city-b")).toEqual({ received: 1, needed: 1, manpowerTier: "CITY" });
    expect(allocation.get("captured-metro")).toEqual({ received: 3, needed: 6, manpowerTier: "GREAT_CITY" });
    expect(allocation.has("small")).toBe(false);
  });
  it("lets each Vivarium cover one of its own town's slots so it draws less from biota sites", () => {
    expect(biotaSlotsNeededFromSites("METROPOLIS", 0)).toBe(6);
    expect(biotaSlotsNeededFromSites("METROPOLIS", 2)).toBe(4);
    expect(biotaSlotsNeededFromSites("GREAT_CITY", 1)).toBe(2);
    expect(biotaSlotsNeededFromSites("CITY", 4)).toBe(0);
    expect(biotaSlotsNeededFromSites("TOWN", 1)).toBe(0);
    const allocation = allocateBiotaSlots([
      { key: "old-metro", tier: "METROPOLIS", heldSince: 100, vivaria: 2 },
      { key: "new-city", tier: "CITY", heldSince: 200 },
      { key: "self-sufficient-city", tier: "CITY", heldSince: 300, vivaria: 3 }
    ], 5);
    expect(allocation.get("old-metro")).toEqual({ received: 6, needed: 6, manpowerTier: "METROPOLIS", local: 2 });
    expect(allocation.get("new-city")).toEqual({ received: 1, needed: 1, manpowerTier: "CITY" });
    expect(allocation.get("self-sufficient-city")).toEqual({ received: 1, needed: 1, manpowerTier: "CITY", local: 1 });
  });
  it("keeps a town with Vivaria but no biota working above Town tier", () => {
    expect(allocateBiotaSlots([{ key: "metro", tier: "METROPOLIS", heldSince: 0, vivaria: 3 }], 0).get("metro"))
      .toEqual({ received: 3, needed: 6, manpowerTier: "GREAT_CITY", local: 3 });
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
  it("delivers a flat 1000 manpower per load whatever the cap, never above the cap", () => {
    // Regression: the delivery scaled with the cap, so larger empires got more per load.
    expect(salvageTributeManpower(0, 2000)).toBe(1000);
    expect(salvageTributeManpower(0, 5000)).toBe(1000);
    expect(salvageTributeManpower(0, 600)).toBe(600);
    expect(salvageTributeManpower(900, 1000)).toBe(100);
    expect(salvageTributeManpower(1000, 1000)).toBe(0);
  });
  it("describes what capturing one more site adds", () => {
    expect(frontierSiteCaptureValue("LUXURY_BIOTA", 2)).toBe("+2 biota slots");
    expect(frontierSiteCaptureValue("PRECURSOR_SALVAGE", 10)).toBe("+0% (arms bonus at its +10% limit)");
  });
});
