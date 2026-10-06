import { describe, expect, it } from "vitest";
import { parseTestShard, valuesForTestShard } from "./season-seed-world-coverage-shard.test-support.js";

describe("world-generation coverage shard selection", () => {
  it("defaults to the complete coverage set outside CI", () => {
    expect(parseTestShard(undefined)).toEqual({ index: 1, total: 1 });
  });

  it("rejects malformed and out-of-range CI shard values", () => {
    expect(() => parseTestShard("0/2")).toThrow("Invalid world-generation coverage shard");
    expect(() => parseTestShard("3/2")).toThrow("index exceeds its total");
  });

  it("partitions every value once without overlap", () => {
    const values = [1000, 1037, 1074, 1111, 1148, 1185, 1222];
    const selected = [1, 2, 3].flatMap((index) => valuesForTestShard(values, { index, total: 3 }));

    expect(selected).toHaveLength(values.length);
    expect(new Set(selected)).toEqual(new Set(values));
  });
});
