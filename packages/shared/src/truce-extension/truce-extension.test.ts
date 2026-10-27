import { describe, expect, it } from "vitest";

import { extendedTruceEndsAt, extensionPricing, truceExtensionFits, TRUCE_EXTENSION_MAX_AHEAD_MS } from "./truce-extension.js";

const HOUR = 3_600_000;

describe("truce extension", () => {
  it("adds hours to the current end, capped at 48h from now", () => {
    expect(extendedTruceEndsAt(10 * HOUR, 12, 0)).toBe(22 * HOUR);
    expect(extendedTruceEndsAt(40 * HOUR, 24, 0)).toBe(TRUCE_EXTENSION_MAX_AHEAD_MS);
    expect(truceExtensionFits(24 * HOUR, 24, 0)).toBe(true);
    expect(truceExtensionFits(24 * HOUR + 1, 24, 0)).toBe(false);
  });

  it("never has the AI pay for an extension, but keeps its asking price and refusals", () => {
    const pricing = { required: { truce12: -200, truce24: 300, alliance: null }, shardCoinValue: 25, aiHoldings: { gold: 1000, shard: 0 } };
    expect(extensionPricing(pricing).required).toEqual({ truce12: 0, truce24: 300, alliance: null });
    expect(extensionPricing({ ...pricing, required: { truce12: null, truce24: null, alliance: 5 } }).required).toEqual({ truce12: null, truce24: null, alliance: 5 });
  });
});
