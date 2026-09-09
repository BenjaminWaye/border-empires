import { describe, expect, it } from "vitest";

import { normalizeSignificance } from "./daily-story-significance.js";

describe("normalizeSignificance", () => {
  it("scales raw magnitude onto a 0-100 range against the given cap", () => {
    expect(normalizeSignificance(150, 300)).toBe(50);
    expect(normalizeSignificance(0, 300)).toBe(0);
    expect(normalizeSignificance(300, 300)).toBe(100);
  });

  it("is not clamped above the cap -- an outlier day scores past 100 rather than tying every other event at the ceiling", () => {
    expect(normalizeSignificance(6000, 300)).toBe(2000);
  });

  it("clamps below zero instead of going negative", () => {
    expect(normalizeSignificance(-50, 300)).toBe(0);
  });

  it("rounds to the nearest integer", () => {
    expect(normalizeSignificance(61, 150)).toBe(41); // 40.667 -> 41
  });
});
