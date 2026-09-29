import { describe, expect, it } from "vitest";
import { costBitsFor, structureBaseKey } from "./client-structure-cost-bits.js";

describe("costBitsFor", () => {
  it("includes the shard cost for a monument part alongside its manpower cost", () => {
    expect(costBitsFor("IMPERIAL_EXCHANGE_PART_1")).toEqual(["1,000 manpower", "1 shard"]);
  });

  it("includes the doubled shard cost for a completed monument", () => {
    expect(costBitsFor("IMPERIAL_EXCHANGE")).toEqual(["1,600 manpower", "2 shard"]);
  });

  it("omits the resource line for structures with no resourceCost", () => {
    expect(costBitsFor("MINTWORKS")).not.toEqual(expect.arrayContaining([expect.stringContaining("shard")]));
  });

  it("does not show a titanium/food/crystal/umbrite line, since those resourceCost entries are never actually charged", () => {
    // FORT has resourceCost { TITANIUM, 45 } in structureCostDefinition, but that cost is stripped
    // before spend server-side (RETIRED_STOCKPILE_RESOURCE_KEYS) -- only its slot requirement is real.
    expect(costBitsFor("FORT")).toEqual(["300 manpower"]);
    expect(costBitsFor("FARMSTEAD")).toEqual(["80 manpower"]);
  });

  // docs/replenishment-update-plan.md D17: these used to be hand-maintained
  // literals here, independent of FORT_TIER_LADDER/SIEGE_TIER_LADDER (the
  // tables the server actually charges from) -- and had already drifted:
  // gold is 0 in both real ladders (manpower-economy-rewrite-plan.md §12
  // zeroed build gold costs), not the 1,800/4,200 these used to claim. Now
  // read live from the same ladders, so there's nothing left to drift.
  it("reads the fort tier upgrades' real cost from FORT_TIER_LADDER, no gold shown since build gold is zeroed", () => {
    expect(costBitsFor("TITANIUM_BASTION")).toEqual(["480 manpower"]);
    expect(costBitsFor("THUNDER_BASTION")).toEqual(["960 manpower"]);
  });

  it("reads the siege tier upgrades' real cost from SIEGE_TIER_LADDER (D13: siege scales 60/120/240)", () => {
    expect(costBitsFor("SIEGE_TOWER")).toEqual(["120 manpower"]);
    expect(costBitsFor("DREAD_TOWER")).toEqual(["240 manpower"]);
  });
});

describe("structureBaseKey", () => {
  it("maps monument parts to themselves", () => {
    expect(structureBaseKey("IMPERIAL_EXCHANGE_PART_1")).toBe("IMPERIAL_EXCHANGE_PART_1");
  });
});
