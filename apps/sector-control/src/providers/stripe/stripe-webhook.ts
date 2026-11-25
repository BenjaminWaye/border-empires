// Verifies Stripe's webhook signature and turns the events the hosting
// service acts on into PaymentEvents. Everything else is "ignored".
//
// Signature scheme (https://docs.stripe.com/webhooks#verify-manually):
// the Stripe-Signature header holds a timestamp `t` and one or more `v1`
// HMAC-SHA256 signatures of `${t}.${rawBody}` under the endpoint's secret.
import { createHmac, timingSafeEqual } from "node:crypto";

import type { HostingPaymentEvent } from "../../hosting-service/hosting-service.js";
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

  /**
   * Refund and dispute events name the payment, not the sector; the sector id
   * (and, for a share of a split-funded sector, the contribution id) lives on
   * the payment's metadata.
   */
  const paymentIntent = async (paymentIntentId: unknown): Promise<{ sectorId?: string; contributionId?: string; status?: string }> => {
    const id = text(paymentIntentId);
    if (!id) return {};
    const intent = await deps.api.get(`/payment_intents/${encodeURIComponent(id)}`);
    const metadata = (intent.metadata ?? {}) as Record<string, unknown>;
    const sectorId = text(metadata.sectorId);
    const contributionId = text(metadata.contributionId);
    const status = text(intent.status);
    return { ...(sectorId ? { sectorId } : {}), ...(contributionId ? { contributionId } : {}), ...(status ? { status } : {}) };
  };

  /** A share's event, from its Checkout Session (held or expired) or its payment (refunded or disputed). */
  const contributionEvent = async (eventId: string, type: unknown, object: Record<string, unknown>, contributionId: string): Promise<HostingPaymentEvent | "ignored"> => {
    if (type === "checkout.session.completed" || type === "checkout.session.async_payment_succeeded") {
      // A share only holds the card: the session completes unpaid, and the hold shows on its payment.
      const { status } = await paymentIntent(object.payment_intent);
      return status === "requires_capture" ? { eventId, kind: "held", contributionId } : "ignored";
    }
    if (type === "checkout.session.expired" || type === "checkout.session.async_payment_failed") return { eventId, kind: "expired", contributionId };
    if (type === "charge.refunded") return { eventId, kind: "refunded", contributionId };
    if (type === "charge.dispute.created") return { eventId, kind: "disputed", contributionId };
    return "ignored";
  };

  return async (rawBody: string, headers: Headers): Promise<HostingPaymentEvent | "ignored" | undefined> => {
    const header = headers["stripe-signature"];
    if (!verifyStripeSignature(rawBody, Array.isArray(header) ? header[0] : header, deps.webhookSecret, Math.floor(now() / 1000))) return undefined;
    const event = JSON.parse(rawBody) as { id?: unknown; type?: unknown; livemode?: unknown; data?: { object?: Record<string, unknown> } };
    const eventId = text(event.id);
    const object = event.data?.object ?? {};
    // A live event can only come from a live endpoint misconfigured to point here.
    if (!eventId || event.livemode !== false) return "ignored";

    // Shares of a split-funded sector carry their contribution id on the session, or on the payment.
    const sessionContribution = text((object.metadata as Record<string, unknown> | undefined)?.contributionId);
    if (sessionContribution && String(event.type).startsWith("checkout.session.")) return contributionEvent(eventId, event.type, object, sessionContribution);
    if (event.type === "charge.refunded" || event.type === "charge.dispute.created") {
      const intent = await paymentIntent(object.payment_intent);
      if (intent.contributionId) return contributionEvent(eventId, event.type, object, intent.contributionId);
      if (!intent.sectorId) return "ignored";
      return { eventId, kind: event.type === "charge.refunded" ? "refunded" : "disputed", sectorId: intent.sectorId };
    }

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
