// Verifies Stripe's webhook signature and turns the events the hosting
// service acts on into PaymentEvents. Everything else is "ignored".
//
// Signature scheme (https://docs.stripe.com/webhooks#verify-manually):
// the Stripe-Signature header holds a timestamp `t` and one or more `v1`
// HMAC-SHA256 signatures of `${t}.${rawBody}` under the endpoint's secret.
import { createHmac, timingSafeEqual } from "node:crypto";

import type { PaymentEvent } from "../../hosting-service/hosting-service.js";
import type { StripeApi } from "./stripe-api.js";

/** Stripe's own libraries allow five minutes; an older event is refused as a possible replay. */
const TOLERANCE_SECONDS = 300;

type Headers = Record<string, string | string[] | undefined>;

export const verifyStripeSignature = (rawBody: string, header: string | undefined, secret: string, nowSeconds: number): boolean => {
  if (!header) return false;
  const parts = header.split(",").map((part) => part.trim().split("="));
  const timestamp = Number(parts.find(([key]) => key === "t")?.[1]);
  const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value ?? "");
  if (!Number.isFinite(timestamp) || signatures.length === 0) return false;
  if (Math.abs(nowSeconds - timestamp) > TOLERANCE_SECONDS) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest();
  return signatures.some((signature) => {
    const given = Buffer.from(signature, "hex");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
};

const text = (value: unknown): string | undefined => (typeof value === "string" && value !== "" ? value : undefined);

export const createStripeWebhookParser = (deps: { api: StripeApi; webhookSecret: string; now?: () => number }) => {
  const now = deps.now ?? (() => Date.now());

  /** Refund and dispute events name the payment, not the sector; the sector id lives on the payment's metadata. */
  const sectorOfPaymentIntent = async (paymentIntent: unknown): Promise<string | undefined> => {
    const id = text(paymentIntent);
    if (!id) return undefined;
    const intent = await deps.api.get(`/payment_intents/${encodeURIComponent(id)}`);
    return text((intent.metadata as Record<string, unknown> | undefined)?.sectorId);
  };

  return async (rawBody: string, headers: Headers): Promise<PaymentEvent | "ignored" | undefined> => {
    const header = headers["stripe-signature"];
    if (!verifyStripeSignature(rawBody, Array.isArray(header) ? header[0] : header, deps.webhookSecret, Math.floor(now() / 1000))) return undefined;
    const event = JSON.parse(rawBody) as { id?: unknown; type?: unknown; livemode?: unknown; data?: { object?: Record<string, unknown> } };
    const eventId = text(event.id);
    const object = event.data?.object ?? {};
    // A live event can only come from a live endpoint misconfigured to point here.
    if (!eventId || event.livemode !== false) return "ignored";

    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const sectorId = text(object.client_reference_id);
        // A completed session whose payment is still processing gets async_payment_succeeded later.
        if (!sectorId || object.payment_status !== "paid") return "ignored";
        const paymentRef = text(object.id);
        return { eventId, kind: "paid", sectorId, ...(paymentRef ? { paymentRef } : {}) };
      }
      case "checkout.session.expired":
      case "checkout.session.async_payment_failed": {
        const sectorId = text(object.client_reference_id);
        return sectorId ? { eventId, kind: "expired", sectorId } : "ignored";
      }
      case "charge.refunded": {
        // Full or partial: a partial refund is a withdrawal with a deduction, and that closes the sector too.
        const sectorId = await sectorOfPaymentIntent(object.payment_intent);
        return sectorId ? { eventId, kind: "refunded", sectorId } : "ignored";
      }
      case "charge.dispute.created": {
        const sectorId = await sectorOfPaymentIntent(object.payment_intent);
        return sectorId ? { eventId, kind: "disputed", sectorId } : "ignored";
      }
      default:
        return "ignored";
    }
  };
};

/** The webhook events to subscribe the endpoint to in the Stripe dashboard. */
export const STRIPE_WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "charge.refunded",
  "charge.dispute.created"
] as const;
