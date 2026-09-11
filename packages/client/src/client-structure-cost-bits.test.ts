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
});

describe("structureBaseKey", () => {
  it("maps monument parts to themselves", () => {
    expect(structureBaseKey("IMPERIAL_EXCHANGE_PART_1")).toBe("IMPERIAL_EXCHANGE_PART_1");
  });
});
