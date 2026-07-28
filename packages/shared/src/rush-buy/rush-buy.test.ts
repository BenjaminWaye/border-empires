import { describe, expect, it } from "vitest";
import { rushBuyPriceGold } from "./rush-buy.js";

describe("rushBuyPriceGold", () => {
  it("full rush from zero elapsed time matches §6.3's anchor table", () => {
    expect(rushBuyPriceGold(10_000, 10_000, 20)).toBe(10); // Settle: 20 manpower -> 10 gold
    expect(rushBuyPriceGold(10_000, 10_000, 80)).toBe(40); // Farmstead: 80 -> 40 gold
    expect(rushBuyPriceGold(10_000, 10_000, 300)).toBe(150); // Bank/Fort: 300 -> 150 gold
  });

  it("scales down with remaining time — 25% remaining costs ~25% of the full price", () => {
    expect(rushBuyPriceGold(2_500, 10_000, 20)).toBe(3); // 0.25 * 20 * 0.5 = 2.5 -> ceil 3
  });

  it("never charges 0 gold while any time remains, even when almost done", () => {
    expect(rushBuyPriceGold(1, 10_000, 300)).toBe(1);
  });

  it("is free once the timer has already elapsed", () => {
    expect(rushBuyPriceGold(0, 10_000, 300)).toBe(0);
    expect(rushBuyPriceGold(-50, 10_000, 300)).toBe(0);
  });

  it("clamps remaining time to the total duration (never charges more than the full anchor price)", () => {
    expect(rushBuyPriceGold(50_000, 10_000, 20)).toBe(10);
  });

  it("is 0 for a zero/negative manpower cost or total duration", () => {
    expect(rushBuyPriceGold(5_000, 10_000, 0)).toBe(0);
    expect(rushBuyPriceGold(5_000, 0, 20)).toBe(0);
  });
});
