import { describe, expect, it } from "vitest";

import { hostedSectorPriceLabel, isAllowedCheckoutUrl, mapSizeIsSellable } from "./client-hosted-sector-order.js";

describe("buying a hosted sector", () => {
  it("shows the launch price", () => {
    expect(hostedSectorPriceLabel()).toBe("USD 20");
  });

  it("sells only a map size this build can draw", () => {
    expect(mapSizeIsSellable("standard")).toBe(true);
    expect(mapSizeIsSellable("small")).toBe(false);
  });

  it("only ever sends the player to Stripe's checkout to pay", () => {
    expect(isAllowedCheckoutUrl("https://checkout.stripe.com/c/pay/abc", false)).toBe(true);
    expect(isAllowedCheckoutUrl("http://checkout.stripe.com/c/pay/abc", false)).toBe(false);
    expect(isAllowedCheckoutUrl("https://checkout.stripe.com.evil.example/pay", false)).toBe(false);
    expect(isAllowedCheckoutUrl("https://evil.example/checkout.stripe.com", false)).toBe(false);
    expect(isAllowedCheckoutUrl("javascript:alert(1)", false)).toBe(false);
    expect(isAllowedCheckoutUrl("javascript:alert(1)", true)).toBe(false);
    // Local development against the fake payment provider.
    expect(isAllowedCheckoutUrl("https://checkout.invalid/fake-pay-s-abc", true)).toBe(true);
  });
});
