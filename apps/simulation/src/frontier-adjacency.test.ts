import { describe, expect, it } from "vitest";

import { isFrontierAdjacent } from "./frontier-adjacency.js";

describe("frontier adjacency", () => {
  it("accepts diagonal neighbors", () => {
    expect(isFrontierAdjacent(24, 245, 23, 246)).toBe(true);
  });

  it("rejects tiles farther than one step away", () => {
    expect(isFrontierAdjacent(24, 245, 22, 246)).toBe(false);
  });
});
