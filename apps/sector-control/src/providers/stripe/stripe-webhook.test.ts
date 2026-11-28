import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createStripeApi } from "./stripe-api.js";
import { fakeStripeFetch } from "./stripe-test-support.js";
import { createStripeWebhookParser, verifyStripeSignature } from "./stripe-webhook.js";

const SECRET = "whsec_test_secret";
const NOW = 1_800_000_000_000;
const nowSeconds = NOW / 1000;

const sign = (body: string, timestamp = nowSeconds, secret = SECRET): string =>
  `t=${timestamp},v1=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;

const event = (type: string, object: Record<string, unknown>, extra: Record<string, unknown> = {}): string =>
  JSON.stringify({ id: `evt_${type}`, type, livemode: false, data: { object }, ...extra });

const makeParser = () => {
  const stripe = fakeStripeFetch((call) => ({
    body: call.path === "/payment_intents/pi_1" ? { id: "pi_1", metadata: { sectorId: "s-abc" } }
      : call.path === "/payment_intents/pi_cos" ? { id: "pi_cos", metadata: { cosmeticOrderId: "co-1" } }
        : { id: "pi_x", metadata: {} }
  }));
  const parse = createStripeWebhookParser({ api: createStripeApi({ secretKey: "sk_test_x", fetchImpl: stripe.fetchImpl }), webhookSecret: SECRET, now: () => NOW });
  return { stripe, parse: (body: string, signature = sign(body)) => parse(body, { "stripe-signature": signature }) };
};

describe("Stripe webhook signature", () => {
  it("accepts Stripe's signature and nothing else", () => {
    const body = event("checkout.session.completed", {});
    expect(verifyStripeSignature(body, sign(body), SECRET, nowSeconds)).toBe(true);
    // One of several v1 signatures may match (Stripe sends more while a secret is being rolled).
    expect(verifyStripeSignature(body, `${sign(body)},v1=${"0".repeat(64)}`, SECRET, nowSeconds)).toBe(true);
    expect(verifyStripeSignature(body, sign(body, nowSeconds, "whsec_other"), SECRET, nowSeconds)).toBe(false);
    expect(verifyStripeSignature(`${body} `, sign(body), SECRET, nowSeconds)).toBe(false);
    expect(verifyStripeSignature(body, undefined, SECRET, nowSeconds)).toBe(false);
    expect(verifyStripeSignature(body, "t=abc,v1=zz", SECRET, nowSeconds)).toBe(false);
  });

  it("refuses an old event as a possible replay", () => {
    const body = event("checkout.session.completed", {});
    expect(verifyStripeSignature(body, sign(body, nowSeconds - 301), SECRET, nowSeconds)).toBe(false);
    expect(verifyStripeSignature(body, sign(body, nowSeconds - 299), SECRET, nowSeconds)).toBe(true);
  });
});

describe("Stripe webhook events", () => {
  it("turns a paid Checkout Session into a payment for its sector, carrying the session id", async () => {
    const { parse } = makeParser();
    expect(await parse(event("checkout.session.completed", { id: "cs_1", client_reference_id: "s-abc", payment_status: "paid" })))
      .toEqual({ eventId: "evt_checkout.session.completed", kind: "paid", sectorId: "s-abc", paymentRef: "cs_1" });
    expect(await parse(event("checkout.session.async_payment_succeeded", { id: "cs_1", client_reference_id: "s-abc", payment_status: "paid" })))
      .toMatchObject({ kind: "paid", sectorId: "s-abc" });
  });

  it("waits for a payment that is still processing", async () => {
    const { parse } = makeParser();
    expect(await parse(event("checkout.session.completed", { id: "cs_1", client_reference_id: "s-abc", payment_status: "unpaid" }))).toBe("ignored");
  });

  it("cancels on an expired session or a failed delayed payment", async () => {
    const { parse } = makeParser();
    expect(await parse(event("checkout.session.expired", { client_reference_id: "s-abc" }))).toMatchObject({ kind: "expired", sectorId: "s-abc" });
    expect(await parse(event("checkout.session.async_payment_failed", { client_reference_id: "s-abc" }))).toMatchObject({ kind: "expired", sectorId: "s-abc" });
  });

  it("finds the sector of a refund or a dispute through the payment's metadata", async () => {
    const { parse, stripe } = makeParser();
    expect(await parse(event("charge.refunded", { payment_intent: "pi_1", amount: 2000, amount_refunded: 2000, refunded: true }))).toMatchObject({ kind: "refunded", sectorId: "s-abc", fullRefund: true });
    // Stripe sends the same event for a partial refund: it must not read as the whole price given back.
    expect(await parse(event("charge.refunded", { payment_intent: "pi_1", amount: 2000, amount_refunded: 500, refunded: false }))).toMatchObject({ kind: "refunded", sectorId: "s-abc", fullRefund: false });
    expect(await parse(event("charge.dispute.created", { id: "dp_1", payment_intent: "pi_1" }))).toMatchObject({ kind: "disputed", sectorId: "s-abc", disputeId: "dp_1" });
    expect(await parse(event("charge.dispute.closed", { id: "dp_1", payment_intent: "pi_1", status: "won" }))).toMatchObject({ kind: "dispute_closed", sectorId: "s-abc", disputeId: "dp_1" });
    expect(stripe.calls.map((call) => call.path)).toEqual(["/payment_intents/pi_1", "/payment_intents/pi_1", "/payment_intents/pi_1", "/payment_intents/pi_1"]);
    // A payment that is not a hosted sector (another product, later) is not ours to act on.
    expect(await parse(event("charge.refunded", { payment_intent: "pi_other" }))).toBe("ignored");
  });

  it("reads a cosmetic order's events by the order id on its session and its payment", async () => {
    const { parse } = makeParser();
    const session = { id: "cs_cos", client_reference_id: "co-1", metadata: { cosmeticOrderId: "co-1" } };
    expect(await parse(event("checkout.session.completed", { ...session, payment_status: "paid" }))).toEqual({ eventId: "evt_checkout.session.completed", kind: "paid", cosmeticOrderId: "co-1", paymentRef: "cs_cos" });
    expect(await parse(event("checkout.session.completed", { ...session, payment_status: "unpaid" }))).toBe("ignored");
    expect(await parse(event("checkout.session.expired", session))).toMatchObject({ kind: "expired", cosmeticOrderId: "co-1" });
    expect(await parse(event("charge.refunded", { payment_intent: "pi_cos", amount: 499, amount_refunded: 499 }))).toMatchObject({ kind: "refunded", cosmeticOrderId: "co-1", fullRefund: true });
    expect(await parse(event("charge.dispute.created", { id: "dp_9", payment_intent: "pi_cos" }))).toMatchObject({ kind: "disputed", cosmeticOrderId: "co-1", disputeId: "dp_9" });
    expect(await parse(event("charge.dispute.closed", { id: "dp_9", payment_intent: "pi_cos", status: "lost" }))).toMatchObject({ kind: "dispute_closed", cosmeticOrderId: "co-1", lost: true });
    expect(await parse(event("charge.dispute.closed", { id: "dp_9", payment_intent: "pi_cos", status: "won" }))).toMatchObject({ kind: "dispute_closed", lost: false });
  });

  it("refuses a bad signature, and ignores live events and everything it does not act on", async () => {
    const { parse } = makeParser();
    const body = event("checkout.session.completed", { id: "cs_1", client_reference_id: "s-abc", payment_status: "paid" });
    expect(await parse(body, sign(body, nowSeconds, "whsec_other"))).toBeUndefined();
    expect(await parse(event("checkout.session.completed", { id: "cs_1", client_reference_id: "s-abc", payment_status: "paid" }, { livemode: true }))).toBe("ignored");
    expect(await parse(event("customer.created", {}))).toBe("ignored");
  });
});
