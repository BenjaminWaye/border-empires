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

  it("does not add a resource line to the hardcoded fort/siege tier upgrades", () => {
    expect(costBitsFor("TITANIUM_BASTION")).toEqual(["1,800 gold", "480 manpower"]);
    expect(costBitsFor("THUNDER_BASTION")).toEqual(["4,200 gold", "960 manpower"]);
    expect(costBitsFor("SIEGE_TOWER")).toEqual(["1,800 gold", "60 manpower"]);
    expect(costBitsFor("DREAD_TOWER")).toEqual(["4,200 gold", "60 manpower"]);
  });
});

describe("structureBaseKey", () => {
  it("maps monument parts to themselves", () => {
    expect(structureBaseKey("IMPERIAL_EXCHANGE_PART_1")).toBe("IMPERIAL_EXCHANGE_PART_1");
  });
});
