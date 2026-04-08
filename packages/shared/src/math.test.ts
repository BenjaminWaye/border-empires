import { describe, expect, it } from "vitest";

import { defensibilityScore } from "./math.js";

describe("defensibilityScore", () => {
  it("keeps compact frontiers at full defense", () => {
    expect(defensibilityScore(20, 22)).toBe(1);
    expect(defensibilityScore(60, 40)).toBe(1);
  });

  it("still penalizes messy or overexposed territory", () => {
    expect(defensibilityScore(20, 30)).toBeLessThan(1);
    expect(defensibilityScore(20, 30)).toBeGreaterThan(0.85);
  });
});
