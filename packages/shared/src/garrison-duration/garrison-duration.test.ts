import { describe, expect, it } from "vitest";
import { frontierClaimDurationMsAt } from "../frontier-claim-duration/frontier-claim-duration.js";
import { INSTANT_GARRISON_COUNT, garrisonBaseDurationMsAt, instantGarrisonsRemaining, nextGarrisonIsInstant } from "./garrison-duration.js";

describe("garrison duration", () => {
  it("equals the frontier claim duration on every tile", () => {
    for (let x = 0; x < 40; x += 1) {
      for (let y = 0; y < 40; y += 1) expect(garrisonBaseDurationMsAt(x, y)).toBe(frontierClaimDurationMsAt(x, y));
    }
  });

  it("gives the first 10 lifetime garrisons for free", () => {
    expect(INSTANT_GARRISON_COUNT).toBe(10);
    expect(instantGarrisonsRemaining(undefined)).toBe(10);
    expect(instantGarrisonsRemaining(0)).toBe(10);
    expect(instantGarrisonsRemaining(9)).toBe(1);
    expect(nextGarrisonIsInstant(9)).toBe(true);
    expect(instantGarrisonsRemaining(10)).toBe(0);
    expect(nextGarrisonIsInstant(10)).toBe(false);
    expect(instantGarrisonsRemaining(250)).toBe(0);
  });
});
