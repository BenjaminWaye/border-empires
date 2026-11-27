import { describe, expect, it } from "vitest";

import { assertStripeTestMode, createStripeApi } from "./stripe-api.js";
import { createStripePaymentProvider } from "./stripe-payment-provider.js";
import { fakeStripeFetch } from "./stripe-test-support.js";

const NOW = 1_800_000_000_000;
const CONFIG = { returnOrigin: "https://play.borderempires.com/", taxCode: "txcd_10000000" };
const ORDER = { sectorId: "s-abc", accountUid: "uid-1", amountCents: 2000, currency: "usd", options: { mapStyle: "continents", mapSize: "standard" }, createdAt: NOW } as const;

describe("Stripe payment provider", () => {
  it("creates one Checkout Session per sector: tax-inclusive USD 20, tax on, address required, traceable to the sector", async () => {
    const stripe = fakeStripeFetch(() => ({ body: { id: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1" } }));
    const provider = createStripePaymentProvider(createStripeApi({ secretKey: "sk_test_x", fetchImpl: stripe.fetchImpl }), CONFIG);
    expect(await provider.createCheckout(ORDER)).toEqual({ paymentRef: "cs_test_1", checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_1" });
    const [call] = stripe.calls;
    expect(call).toMatchObject({ method: "POST", path: "/checkout/sessions" });
    // A repeated request for the same sector returns the same session.
    expect(call?.headers["idempotency-key"]).toBe("checkout-s-abc");
    expect(call?.headers.authorization).toBe("Bearer sk_test_x");
    expect(call?.params).toMatchObject({
      mode: "payment",
      client_reference_id: "s-abc",
      "metadata[sectorId]": "s-abc",
      "payment_intent_data[metadata][sectorId]": "s-abc",
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][unit_amount]": "2000",
      "line_items[0][price_data][tax_behavior]": "inclusive",
      "line_items[0][price_data][product_data][name]": "Hosted sector: Continents, standard map",
      "line_items[0][price_data][product_data][tax_code]": "txcd_10000000",
      "automatic_tax[enabled]": "true",
      billing_address_collection: "required",
      success_url: "https://play.borderempires.com/?hosted=paid&sector=s-abc",
      cancel_url: "https://play.borderempires.com/?hosted=cancelled&sector=s-abc",
      expires_at: String(NOW / 1000 + 35 * 60)
    });
    expect(call?.params["custom_text[submit][message]"]).toMatch(/withdraw/);
    // Directly above Pay: a single payment with tax, and the right to withdraw ends with the contest.
    expect(call?.params["custom_text[submit][message]"]).toMatch(/single payment, tax included/);
    expect(call?.params["custom_text[submit][message]"]).toMatch(/lose the right to withdraw once its Sector Contest has ended/);
  });

  it("sends identical parameters when asked again for the same order, as Stripe's idempotency requires", async () => {
    const stripe = fakeStripeFetch(() => ({ body: { id: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1" } }));
    const provider = createStripePaymentProvider(createStripeApi({ secretKey: "sk_test_x", fetchImpl: stripe.fetchImpl }), CONFIG);
    await provider.createCheckout(ORDER);
    await provider.createCheckout(ORDER);
    expect(stripe.calls[1]?.params).toEqual(stripe.calls[0]?.params);
    expect(stripe.calls[1]?.headers["idempotency-key"]).toBe(stripe.calls[0]?.headers["idempotency-key"]);
  });

  it("reports a session as paid, expired or still open", async () => {
    const sessions: Record<string, Record<string, unknown>> = {
      cs_paid: { status: "complete", payment_status: "paid" },
      cs_processing: { status: "complete", payment_status: "unpaid" },
      cs_expired: { status: "expired", payment_status: "unpaid" },
      cs_open: { status: "open", payment_status: "unpaid" }
    };
    const stripe = fakeStripeFetch((call) => ({ body: sessions[call.path.split("/").pop() ?? ""] ?? {} }));
    const provider = createStripePaymentProvider(createStripeApi({ secretKey: "sk_test_x", fetchImpl: stripe.fetchImpl }), CONFIG);
    expect(await provider.getCheckoutStatus("cs_paid")).toBe("paid");
    expect(await provider.getCheckoutStatus("cs_processing")).toBe("open");
    expect(await provider.getCheckoutStatus("cs_expired")).toBe("expired");
    expect(await provider.getCheckoutStatus("cs_open")).toBe("open");
  });

  it("refunds part of a payment once, even after Stripe forgets the idempotency key, and never more than is left", async () => {
    let refunds: Array<Record<string, unknown>> = [];
    const stripe = fakeStripeFetch((call) => {
      if (call.path.startsWith("/checkout/sessions/")) return { body: { id: "cs_1", payment_intent: "pi_1", client_reference_id: "s-abc" } };
      if (call.path.startsWith("/refunds?")) return { body: { data: refunds } };
      if (call.path === "/payment_intents/pi_1") return { body: { id: "pi_1", amount_received: 2000 } };
      return { body: { id: "re_new" } };
    });
    const provider = createStripePaymentProvider(createStripeApi({ secretKey: "sk_test_x", fetchImpl: stripe.fetchImpl }), CONFIG);
    await provider.refund("cs_1", { amountCents: 1933, idempotencyKey: "withdrawal-s-abc" });
    expect(stripe.calls.at(-1)).toMatchObject({
      method: "POST", path: "/refunds",
      params: { payment_intent: "pi_1", amount: "1933", "metadata[withdrawal]": "withdrawal-s-abc" },
      headers: { "idempotency-key": "refund-withdrawal-s-abc-1933" }
    });
    // A day later the key has expired at Stripe, but the refund it made is found by its metadata.
    refunds = [{ amount: 1933, status: "succeeded", metadata: { withdrawal: "withdrawal-s-abc" } }];
    const before = stripe.calls.length;
    await provider.refund("cs_1", { amountCents: 1933, idempotencyKey: "withdrawal-s-abc" });
    expect(stripe.calls.slice(before).some((call) => call.method === "POST")).toBe(false);
    // The owner refunded USD 10 by hand first: only what is left goes back.
    refunds = [{ amount: 1000, status: "succeeded", metadata: {} }];
    await provider.refund("cs_1", { amountCents: 1933, idempotencyKey: "withdrawal-s-xyz" });
    expect(stripe.calls.at(-1)).toMatchObject({ method: "POST", path: "/refunds", params: { amount: "1000" } });
  });

  it("refunds the session's payment in full, once, and treats an earlier refund as done", async () => {
    let alreadyRefunded = false;
    const stripe = fakeStripeFetch((call) => {
      if (call.method === "GET") return { body: { id: "cs_1", payment_intent: "pi_1", client_reference_id: "s-abc" } };
      return alreadyRefunded ? { status: 400, body: { error: { code: "charge_already_refunded", message: "already refunded" } } } : { body: { id: "re_1" } };
    });
    const provider = createStripePaymentProvider(createStripeApi({ secretKey: "sk_test_x", fetchImpl: stripe.fetchImpl }), CONFIG);
    await provider.refund("cs_1");
    expect(stripe.calls[1]).toMatchObject({ method: "POST", path: "/refunds", params: { payment_intent: "pi_1" }, headers: { "idempotency-key": "refund-cs_1" } });
    expect(stripe.calls[1]?.params.amount).toBeUndefined();
    alreadyRefunded = true;
    await expect(provider.refund("cs_1")).resolves.toBeUndefined();

  });

  it("throws on any other refund failure, so the reconciler tries again", async () => {
    const stripe = fakeStripeFetch((call) => call.method === "GET"
      ? { body: { payment_intent: "pi_1" } }
      : { status: 500, body: { error: { message: "api_error" } } });
    const provider = createStripePaymentProvider(createStripeApi({ secretKey: "sk_test_x", fetchImpl: stripe.fetchImpl }), CONFIG);
    await expect(provider.refund("cs_1")).rejects.toThrow(/500/);
    const noPayment = fakeStripeFetch(() => ({ body: { payment_intent: null } }));
    await expect(createStripePaymentProvider(createStripeApi({ secretKey: "sk_test_x", fetchImpl: noPayment.fetchImpl }), CONFIG).refund("cs_2")).rejects.toThrow(/no payment/);
  });
});

describe("Stripe test mode guard", () => {
  it("refuses a visibly live key outright", () => {
    expect(() => createStripeApi({ secretKey: "sk_live_x" })).toThrow(/test mode only/);
    expect(() => createStripeApi({ secretKey: "rk_live_x" })).toThrow(/test mode only/);
  });

  it("asks Stripe and refuses a key that turns out to be live", async () => {
    const live = fakeStripeFetch(() => ({ body: { object: "balance", livemode: true } }));
    await expect(assertStripeTestMode(createStripeApi({ secretKey: "sk_test_x", fetchImpl: live.fetchImpl }))).rejects.toThrow(/live-mode/);
    const test = fakeStripeFetch(() => ({ body: { object: "balance", livemode: false } }));
    await expect(assertStripeTestMode(createStripeApi({ secretKey: "sk_test_x", fetchImpl: test.fetchImpl }))).resolves.toBeUndefined();
    const unreadable = fakeStripeFetch(() => ({ status: 401, body: { error: { message: "Invalid API Key provided" } } }));
    await expect(assertStripeTestMode(createStripeApi({ secretKey: "sk_test_x", fetchImpl: unreadable.fetchImpl }))).rejects.toThrow(/401/);
  });
});
