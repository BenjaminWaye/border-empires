import { describe, expect, it } from "vitest";

import { clampOwnershipBorderWidth } from "./client-ownership-borders.js";

describe("clampOwnershipBorderWidth", () => {
  it("preserves wider ownership styles when tiles are large", () => {
    expect(clampOwnershipBorderWidth(3, 48)).toBe(3);
    expect(clampOwnershipBorderWidth(2.25, 40)).toBe(2.25);
  });

  it("shrinks wide borders when zoomed far out", () => {
    expect(clampOwnershipBorderWidth(3, 20)).toBeCloseTo(1.6);
    expect(clampOwnershipBorderWidth(2.5, 12)).toBeCloseTo(0.96);
  });

  it("keeps a visible minimum line", () => {
    expect(clampOwnershipBorderWidth(3, 4)).toBe(0.9);
    expect(clampOwnershipBorderWidth(2, 0)).toBe(2);
  });
});
