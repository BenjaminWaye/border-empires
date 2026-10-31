import { describe, expect, it } from "vitest";

import { extendedTruceEndsAt, extensionPricing, truceExtensionFits, TRUCE_MAX_LIFETIME_MS } from "./truce-extension.js";

const HOUR = 3_600_000;

describe("truce extension", () => {
  it("adds hours to the current end, capped at 48h after the truce began", () => {
    expect(extendedTruceEndsAt(0, 10 * HOUR, 12, 0)).toBe(22 * HOUR);
    expect(extendedTruceEndsAt(0, 40 * HOUR, 24, 0)).toBe(TRUCE_MAX_LIFETIME_MS);
    expect(truceExtensionFits(0, 24 * HOUR, 24, 0)).toBe(true);
    expect(truceExtensionFits(0, 24 * HOUR + 1, 24, 0)).toBe(false);
  });

  // Regression: the cap was 48h ahead of *now*, so re-extending every day kept a truce running for weeks.
  it("measures the cap from the truce's start, not from now", () => {
    expect(extendedTruceEndsAt(0, 40 * HOUR, 24, 30 * HOUR)).toBe(TRUCE_MAX_LIFETIME_MS);
    expect(truceExtensionFits(0, 36 * HOUR, 12, 30 * HOUR)).toBe(true);
    expect(truceExtensionFits(0, 40 * HOUR, 12, 30 * HOUR)).toBe(false);
    expect(truceExtensionFits(0, 47 * HOUR, 12, 46 * HOUR)).toBe(false);
  });

  // Regression (review): a truce already rolled past the cap must not have its end pulled earlier by an extension.
  it("never moves the end earlier than it already is", () => {
    expect(extendedTruceEndsAt(0, 90 * HOUR, 12, 60 * HOUR)).toBe(90 * HOUR);
  });

  it("never has the AI pay for an extension, but keeps its asking price and refusals", () => {
    const pricing = { required: { truce12: -200, truce24: 300, alliance: null }, shardCoinValue: 25, aiHoldings: { gold: 1000, shard: 0 } };
    expect(extensionPricing(pricing).required).toEqual({ truce12: 0, truce24: 300, alliance: null });
    expect(extensionPricing({ ...pricing, required: { truce12: null, truce24: null, alliance: 5 } }).required).toEqual({ truce12: null, truce24: null, alliance: 5 });
  });
});
