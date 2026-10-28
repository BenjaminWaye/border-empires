import { describe, expect, it } from "vitest";

import { attitudeForScore, giftCoinToCap, giftOpinionGain, giftToReach, giftView, goodwillPointsFor, MAX_GOODWILL_POINTS } from "./diplomacy-gift.js";

describe("diplomacy gifts", () => {
  it("keeps the attitude thresholds", () => {
    expect([-40, -39, -15, -14, 9, 10, 24, 25].map(attitudeForScore)).toEqual([
      "FURIOUS",
      "ANNOYED",
      "ANNOYED",
      "CAUTIOUS",
      "CAUTIOUS",
      "PLEASED",
      "PLEASED",
      "FRIENDLY"
    ]);
  });

  it("is worth 6 points per hour of income, capped", () => {
    expect(goodwillPointsFor(60, 60)).toBe(6);
    expect(goodwillPointsFor(10_000, 60)).toBe(MAX_GOODWILL_POINTS);
    expect(goodwillPointsFor(60, 0)).toBe(0);
  });

  it("previews the rounded opinion gain", () => {
    const view = giftView(0, 60); // 10 coin per point
    expect(giftOpinionGain(view, 3)).toBe(0);
    expect(giftOpinionGain(view, 5)).toBe(1);
    expect(giftOpinionGain(view, 200)).toBe(20);
    expect(giftOpinionGain(view, 100_000)).toBe(MAX_GOODWILL_POINTS);
    expect(giftOpinionGain(giftView(10_000, 60), 500)).toBe(0);
  });

  it("finds the least coin to reach an attitude", () => {
    const view = giftView(0, 60);
    const coin = giftToReach(view, -10, 10);
    // 195 would just round to +20; a little margin keeps it there if goodwill fades first.
    expect(coin).toBe(196);
    expect(giftOpinionGain(view, coin ?? 0)).toBe(20);
    // From 10 points already given: the suggestion survives a little fading before it lands.
    const given = giftView(100, 60);
    const more = giftToReach(given, 0, 10) ?? 0;
    expect(more).toBe(96);
    expect(giftOpinionGain({ ...given, goodwillPoints: 9.95 }, more)).toBe(10);
    expect(giftToReach(view, 12, 10)).toBe(0);
    // The goodwill cap stops gifts short of 30 points.
    expect(giftToReach(view, -20, 10)).toBeUndefined();
  });

  it("knows how much coin reaches the goodwill cap", () => {
    expect(giftCoinToCap(giftView(0, 60))).toBe(250);
    expect(giftCoinToCap(giftView(10_000, 60))).toBe(0);
  });
});
