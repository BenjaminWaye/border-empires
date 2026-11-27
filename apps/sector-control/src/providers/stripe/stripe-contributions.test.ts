import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createStripeApi } from "./stripe-api.js";
import { createStripePaymentProvider } from "./stripe-payment-provider.js";
import { fakeStripeFetch } from "./stripe-test-support.js";
import { createStripeWebhookParser } from "./stripe-webhook.js";

const NOW = 1_800_000_000_000;
const CONFIG = { returnOrigin: "https://play.borderempires.com", taxCode: "txcd_10000000" };
const SHARE = { contributionId: "c-1", sectorId: "s-abc", accountUid: "uid-2", amountCents: 700, currency: "usd", options: { mapStyle: "continents", mapSize: "standard" }, createdAt: NOW } as const;

const providerWith = (respond: Parameters<typeof fakeStripeFetch>[0]) => {
  const stripe = fakeStripeFetch(respond);
  return { stripe, provider: createStripePaymentProvider(createStripeApi({ secretKey: "sk_test_x", fetchImpl: stripe.fetchImpl }), CONFIG) };
};

describe("Stripe shares of a split-funded sector", () => {
  it("creates a Checkout Session that only holds the card, traceable to the share and the sector", async () => {
    const { stripe, provider } = providerWith(() => ({ body: { id: "cs_test_c1", url: "https://checkout.stripe.com/c/pay/cs_test_c1" } }));
    expect(await provider.createContributionCheckout(SHARE)).toEqual({ paymentRef: "cs_test_c1", checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_c1" });
    const [call] = stripe.calls;
    expect(call?.headers["idempotency-key"]).toBe("contribution-c-1");
    expect(call?.params).toMatchObject({
      "payment_intent_data[capture_method]": "manual",
      "payment_method_types[0]": "card",
      "metadata[contributionId]": "c-1",
      "payment_intent_data[metadata][contributionId]": "c-1",
      "payment_intent_data[metadata][sectorId]": "s-abc",
      "line_items[0][price_data][unit_amount]": "700",
      "line_items[0][price_data][tax_behavior]": "inclusive",
      "line_items[0][price_data][product_data][name]": "Share of a hosted sector: Continents, standard map",
      "automatic_tax[enabled]": "true",
      success_url: "https://play.borderempires.com/?hosted=pledged&sector=s-abc"
    });
    expect(call?.params["custom_text[submit][message]"]).toMatch(/only held/);
    // A share is a purchase of its own: the same early-start terms are stated before paying.
    expect(call?.params["custom_text[submit][message]"]).toMatch(/lose the right to withdraw once its Sector Contest has ended/);
  });

  it("reports what happened to a share's money: held, captured, released, or a checkout open or expired", async () => {
    const answers: Record<string, Record<string, unknown>> = {
      "/checkout/sessions/cs_held": { status: "complete", payment_intent: "pi_held" },
      "/payment_intents/pi_held": { status: "requires_capture" },
      "/checkout/sessions/cs_taken": { status: "complete", payment_intent: "pi_taken" },
      "/payment_intents/pi_taken": { status: "succeeded" },
      "/checkout/sessions/cs_let_go": { status: "complete", payment_intent: "pi_let_go" },
      "/payment_intents/pi_let_go": { status: "canceled" },
      "/checkout/sessions/cs_open": { status: "open" },
      "/checkout/sessions/cs_gone": { status: "expired" }
    };
    const { provider } = providerWith((call) => ({ body: answers[call.path] ?? {} }));
    expect(await provider.getContributionStatus("cs_held")).toBe("held");
    // A captured share is not "held": a release would fail, so it must be refunded instead.
    expect(await provider.getContributionStatus("cs_taken")).toBe("captured");
    expect(await provider.getContributionStatus("cs_let_go")).toBe("released");
    expect(await provider.getContributionStatus("cs_open")).toBe("open");
    expect(await provider.getContributionStatus("cs_gone")).toBe("expired");
  });

  it("captures the asked amount of a held payment once, and treats an earlier capture as done", async () => {
    let status = "requires_capture";
    const { stripe, provider } = providerWith((call) => {
      if (call.path === "/checkout/sessions/cs_1") return { body: { status: "complete", payment_intent: "pi_1" } };
      if (call.path === "/payment_intents/pi_1") return { body: { status } };
      return { body: { id: "pi_1", status: "succeeded" } };
    });
    await provider.capture("cs_1", 700);
    expect(stripe.calls.at(-1)).toMatchObject({ method: "POST", path: "/payment_intents/pi_1/capture", params: { amount_to_capture: "700" }, headers: { "idempotency-key": "capture-cs_1-700" } });
    status = "succeeded";
    const before = stripe.calls.length;
    await provider.capture("cs_1", 700);
    expect(stripe.calls.slice(before).some((call) => call.method === "POST")).toBe(false);
    status = "canceled";
    await expect(provider.capture("cs_1", 700)).rejects.toThrow(/cannot be captured/);
  });

  it("releases a hold, closes an unpaid checkout, and refuses to 'release' money already taken", async () => {
    const sessions: Record<string, Record<string, unknown>> = {
      "/checkout/sessions/cs_held": { status: "complete", payment_intent: "pi_held" },
      "/checkout/sessions/cs_open": { status: "open" },
      "/checkout/sessions/cs_taken": { status: "complete", payment_intent: "pi_taken" }
    };
    const intents: Record<string, string> = { "/payment_intents/pi_held": "requires_capture", "/payment_intents/pi_taken": "succeeded" };
    const { stripe, provider } = providerWith((call) => ({ body: sessions[call.path] ?? (intents[call.path] ? { status: intents[call.path] } : {}) }));
    await provider.release("cs_held");
    expect(stripe.calls.some((call) => call.method === "POST" && call.path === "/payment_intents/pi_held/cancel")).toBe(true);
    await provider.release("cs_open");
    expect(stripe.calls.some((call) => call.method === "POST" && call.path === "/checkout/sessions/cs_open/expire")).toBe(true);
    await expect(provider.release("cs_taken")).rejects.toThrow(/refund it instead/);
  });
});

describe("Stripe webhook: shares", () => {
  const SECRET = "whsec_test";
  const sign = (body: string) => `t=${NOW / 1000},v1=${createHmac("sha256", SECRET).update(`${NOW / 1000}.${body}`).digest("hex")}`;
  const parserWith = (intents: Record<string, Record<string, unknown>>) => {
    const stripe = fakeStripeFetch((call) => ({ body: intents[call.path] ?? {} }));
    const parse = createStripeWebhookParser({ api: createStripeApi({ secretKey: "sk_test_x", fetchImpl: stripe.fetchImpl }), webhookSecret: SECRET, now: () => NOW });
    return (type: string, object: Record<string, unknown>) => {
      const body = JSON.stringify({ id: `evt_${type}`, type, livemode: false, data: { object } });
      return parse(body, { "stripe-signature": sign(body) });
    };
  };

  it("reports a completed share as held only when its card is actually held", async () => {
    const parse = parserWith({ "/payment_intents/pi_h": { status: "requires_capture", metadata: { contributionId: "c-1" } }, "/payment_intents/pi_x": { status: "requires_payment_method" } });
    expect(await parse("checkout.session.completed", { id: "cs_1", payment_status: "unpaid", payment_intent: "pi_h", client_reference_id: "s-abc", metadata: { contributionId: "c-1" } }))
      .toEqual({ eventId: "evt_checkout.session.completed", kind: "held", contributionId: "c-1" });
    expect(await parse("checkout.session.completed", { id: "cs_2", payment_status: "unpaid", payment_intent: "pi_x", metadata: { contributionId: "c-2" } })).toBe("ignored");
    expect(await parse("checkout.session.expired", { id: "cs_3", metadata: { contributionId: "c-3" } })).toMatchObject({ kind: "expired", contributionId: "c-3" });
  });

  it("reports a refund or dispute of a share against that share, not the whole sector", async () => {
    const parse = parserWith({
      "/payment_intents/pi_share": { status: "succeeded", metadata: { sectorId: "s-abc", contributionId: "c-1" } },
      "/payment_intents/pi_whole": { status: "succeeded", metadata: { sectorId: "s-xyz" } }
    });
    expect(await parse("charge.refunded", { payment_intent: "pi_share", refunded: true })).toMatchObject({ kind: "refunded", contributionId: "c-1", fullRefund: true });
    expect(await parse("charge.refunded", { payment_intent: "pi_share", amount: 700, amount_refunded: 200, refunded: false })).toMatchObject({ kind: "refunded", contributionId: "c-1", fullRefund: false });
    expect(await parse("charge.dispute.created", { id: "dp_2", payment_intent: "pi_share" })).toMatchObject({ kind: "disputed", contributionId: "c-1", disputeId: "dp_2" });
    expect(await parse("charge.refunded", { payment_intent: "pi_whole" })).toMatchObject({ kind: "refunded", sectorId: "s-xyz" });
  });
});
