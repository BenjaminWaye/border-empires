import { describe, expect, it } from "vitest";

import { weaponsFactoryCountsFromIndex } from "./runtime-owned-structure-index.js";

// Regression for the 2026-09-17 prod CPU-throttle incident: the PLAYER_UPDATE
// modBreakdown used to derive weapons-factory counts by scanning every tile
// in the world (202k) on every passive-income tick. It must now read the
// maintained per-owner index that combat already uses.
describe("weaponsFactoryCountsFromIndex", () => {
  it("reads Titanium/Umbrite Weapons Factory counts from the per-owner index", () => {
    const index = new Map([
      ["p1", new Map([["TITANIUM_WEAPONS_FACTORY" as const, 2], ["UMBRITE_WEAPONS_FACTORY" as const, 1], ["FORT" as const, 9]])],
      ["p2", new Map([["UMBRITE_WEAPONS_FACTORY" as const, 3]])]
    ]);
    expect(weaponsFactoryCountsFromIndex(index, "p1")).toEqual({ titanium: 2, umbrite: 1 });
    expect(weaponsFactoryCountsFromIndex(index, "p2")).toEqual({ titanium: 0, umbrite: 3 });
    expect(weaponsFactoryCountsFromIndex(index, "nobody")).toEqual({ titanium: 0, umbrite: 0 });
  });
});
