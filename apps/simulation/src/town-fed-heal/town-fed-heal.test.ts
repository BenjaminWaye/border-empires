import { describe, expect, it } from "vitest";

import { townWithFreshIsFed } from "./town-fed-heal.js";

describe("townWithFreshIsFed", () => {
  const town = { type: "MARKET" as const, populationTier: "TOWN" as const, isFed: true, goldPerMinute: 0.01, populationGrowthPerMinute: 6.5 };

  it("leaves a town that already agrees alone", () => {
    expect(townWithFreshIsFed(town, true)).toBeUndefined();
  });

  it("zeroes coin and growth on a town that went unfed", () => {
    expect(townWithFreshIsFed(town, false)).toMatchObject({ isFed: false, goldPerMinute: 0, populationGrowthPerMinute: 0 });
  });

  it("flips a newly fed town without touching its rates", () => {
    expect(townWithFreshIsFed({ ...town, isFed: false }, true)).toMatchObject({ isFed: true, goldPerMinute: 0.01 });
  });
});
