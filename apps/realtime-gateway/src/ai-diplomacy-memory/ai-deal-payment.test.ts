import { describe, expect, it } from "vitest";

import { aiPaymentFromDeal } from "./ai-deal-payment.js";

describe("goodwill from an accepted AI deal", () => {
  it("counts coin paid to the AI, and coin it paid as negative", () => {
    expect(aiPaymentFromDeal("ai-1", { toPlayerId: "ai-1", terms: { give: { gold: 300 }, ask: { gold: 0 } } })).toBe(300);
    expect(aiPaymentFromDeal("ai-1", { toPlayerId: "p1", terms: { give: { gold: 200 }, ask: { gold: 0 } } })).toBe(-200);
  });

  // Regression: gold paid for the AI's own Coin per day was logged as goodwill,
  // so a player got their coin back over the truce and kept the goodwill.
  it("takes the AI's pledge over the truce off what it was paid", () => {
    const terms = { give: { gold: 600 }, ask: { gold: 0, coinPerHour: 50 } };
    expect(aiPaymentFromDeal("ai-1", { toPlayerId: "ai-1", terms, durationHours: 12 })).toBe(0);
    // The AI proposed it: it gives 50/h and asks 600.
    expect(aiPaymentFromDeal("ai-1", { toPlayerId: "p1", terms: { give: { gold: 0, coinPerHour: 50 }, ask: { gold: 600 } }, durationHours: 12 })).toBe(0);
  });

  it("records no goodwill when the AI hands back a town", () => {
    const terms = { give: { gold: 500 }, ask: { gold: 0, towns: [{ x: 7, y: 8 }] } };
    expect(aiPaymentFromDeal("ai-1", { toPlayerId: "ai-1", terms, durationHours: 12 })).toBe(0);
  });
});
