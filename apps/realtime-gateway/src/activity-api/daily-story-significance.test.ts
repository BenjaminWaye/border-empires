import { describe, expect, it } from "vitest";

import { normalizeSignificance } from "./daily-story-significance.js";

describe("normalizeSignificance", () => {
  it("scales raw magnitude onto a 0-100 range against the given cap", () => {
    expect(normalizeSignificance(150, 300)).toBe(50);
    expect(normalizeSignificance(0, 300)).toBe(0);
    expect(normalizeSignificance(300, 300)).toBe(100);
  });

  it("clamps above the cap instead of exceeding 100", () => {
    expect(normalizeSignificance(6000, 300)).toBe(100);
  });

  it("clamps below zero instead of going negative", () => {
    expect(normalizeSignificance(-50, 300)).toBe(0);
  });

  it("rounds to the nearest integer", () => {
    expect(normalizeSignificance(61, 150)).toBe(41); // 40.667 -> 41
  });
});
