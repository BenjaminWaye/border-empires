// PaymentProvider backed by Stripe Checkout (plan section 4, PR 5).
//
// One Checkout Session per sector. The sector id is the idempotency key and
// is stored on the session, so a repeated request returns the same session
// and every webhook can be traced back to its sector.
import type { HostedSectorOptions } from "@border-empires/shared";

import type { CheckoutStatus, PaymentProvider } from "../providers.js";
import { StripeApiError, type StripeApi } from "./stripe-api.js";
import { createStripeContributionMethods } from "./stripe-contributions.js";

export type StripePaymentProviderConfig = {
  /** Where the player returns after paying or cancelling, e.g. https://play.borderempires.com */
  returnOrigin: string;
  /**
   * Stripe's tax category for the product. "General - Electronically
   * Supplied Services" until the accountant names another
   * (docs/hosted-sectors-tax.md).
   */
  taxCode: string;
};

/**
 * Counted from the order's creation, not from the call, so a repeated request
 * sends identical parameters: Stripe refuses an idempotency key reused with
 * different ones. Stripe's shortest allowed lifetime is 30 minutes; the
 * margin covers the time between creating the order and this call.
 */
const CHECKOUT_LIFETIME_SECONDS = 35 * 60;

/**
 * Shown above the Pay button. The player has already ticked the same consent
 * in the game; Checkout repeats it next to the payment.
 */
export const CHECKOUT_CONSENT_TEXT =
  "One single payment, tax included. Your sector starts as soon as you pay: you asked us to start it during the 14-day withdrawal period. If you withdraw, we keep a part of the price for the days it was open, and you lose the right to withdraw once its Sector Contest has ended. See the Terms of Sale.";

/** Shown above the Pay button for a cosmetic: the same request and acknowledgement the buyer ticked in the game. */
export const COSMETIC_CHECKOUT_CONSENT_TEXT =
  "One single payment, tax included. You asked for this item to be added to your account at once, and you lose your right to withdraw when it is. See the Terms of Sale.";

const productName = (options: HostedSectorOptions): string =>
  `Hosted sector: ${options.mapStyle === "islands" ? "Islands" : "Continents"}, ${options.mapSize === "small" ? "small" : "standard"} map`;

export const createStripePaymentProvider = (api: StripeApi, config: StripePaymentProviderConfig): PaymentProvider => {
  const origin = config.returnOrigin.replace(/\/+$/, "");
  return {
    ...createStripeContributionMethods(api, { returnOrigin: config.returnOrigin, taxCode: config.taxCode, productName }),
    async createCheckout(input) {
      const params: Record<string, string> = {
        mode: "payment",
        client_reference_id: input.sectorId,
        "metadata[sectorId]": input.sectorId,
        "metadata[accountUid]": input.accountUid,
        "payment_intent_data[metadata][sectorId]": input.sectorId,
        "line_items[0][quantity]": "1",
        "line_items[0][price_data][currency]": input.currency,
        "line_items[0][price_data][unit_amount]": String(input.amountCents),
        // The price includes any tax: the player always pays USD 20 (owner decision Q13).
        "line_items[0][price_data][tax_behavior]": "inclusive",
        "line_items[0][price_data][product_data][name]": productName(input.options),
        "line_items[0][price_data][product_data][tax_code]": config.taxCode,
        "automatic_tax[enabled]": "true",
        // Tax depends on where the buyer is, so their billing address is required.
        billing_address_collection: "required",
        "custom_text[submit][message]": CHECKOUT_CONSENT_TEXT,
        success_url: `${origin}/?hosted=paid&sector=${encodeURIComponent(input.sectorId)}`,
        cancel_url: `${origin}/?hosted=cancelled&sector=${encodeURIComponent(input.sectorId)}`,
        expires_at: String(Math.floor(input.createdAt / 1000) + CHECKOUT_LIFETIME_SECONDS)
      };
      const session = await api.post("/checkout/sessions", params, `checkout-${input.sectorId}`);
      if (typeof session.id !== "string" || typeof session.url !== "string") throw new Error("Stripe returned a Checkout Session without an id or url");
      return { paymentRef: session.id, checkoutUrl: session.url };
    },

    async createProductCheckout(input) {
      const params: Record<string, string> = {
        mode: "payment",
        client_reference_id: input.orderId,
        "metadata[cosmeticOrderId]": input.orderId,
        "metadata[accountUid]": input.accountUid,
        "metadata[productId]": input.productId,
        "payment_intent_data[metadata][cosmeticOrderId]": input.orderId,
        "line_items[0][quantity]": "1",
        "line_items[0][price_data][currency]": input.currency,
        "line_items[0][price_data][unit_amount]": String(input.amountCents),
        // As for sectors: the price shown is the price paid, tax included.
        "line_items[0][price_data][tax_behavior]": "inclusive",
        "line_items[0][price_data][product_data][name]": input.productName,
        "line_items[0][price_data][product_data][tax_code]": config.taxCode,
        "automatic_tax[enabled]": "true",
        billing_address_collection: "required",
        "custom_text[submit][message]": COSMETIC_CHECKOUT_CONSENT_TEXT,
        success_url: `${origin}/?cosmetic=paid&order=${encodeURIComponent(input.orderId)}`,
        cancel_url: `${origin}/?cosmetic=cancelled&order=${encodeURIComponent(input.orderId)}`,
        expires_at: String(Math.floor(input.createdAt / 1000) + CHECKOUT_LIFETIME_SECONDS)
      };
      const session = await api.post("/checkout/sessions", params, `cosmetic-checkout-${input.orderId}`);
      if (typeof session.id !== "string" || typeof session.url !== "string") throw new Error("Stripe returned a Checkout Session without an id or url");
      return { paymentRef: session.id, checkoutUrl: session.url };
    },

    async getCheckoutStatus(paymentRef): Promise<CheckoutStatus> {
      const session = await api.get(`/checkout/sessions/${encodeURIComponent(paymentRef)}`);
      if (session.status === "complete" && session.payment_status === "paid") return "paid";
      if (session.status === "expired") return "expired";
      return "open";
    },

    async refund(paymentRef, partial) {
      /**
       * How much of a partial refund still to send: 0 when a refund with this
       * key exists already; otherwise the amount asked, capped at what has not
       * been refunded yet (the owner may have refunded part by hand).
       */
      const partialRefundAmount = async (paymentIntent: string, wanted: { amountCents: number; idempotencyKey: string }): Promise<number> => {
        const listed = await api.get(`/refunds?payment_intent=${encodeURIComponent(paymentIntent)}&limit=100`);
        const live = ((listed.data ?? []) as Array<{ amount?: unknown; status?: unknown; metadata?: Record<string, unknown> }>)
          .filter((refund) => refund.status !== "failed" && refund.status !== "canceled");
        if (live.some((refund) => refund.metadata?.withdrawal === wanted.idempotencyKey)) return 0;
        const intent = await api.get(`/payment_intents/${encodeURIComponent(paymentIntent)}`);
        const refunded = live.reduce((sum, refund) => sum + (typeof refund.amount === "number" ? refund.amount : 0), 0);
        const received = typeof intent.amount_received === "number" ? intent.amount_received : 0;
        return Math.min(wanted.amountCents, received - refunded);
      };
      const session = await api.get(`/checkout/sessions/${encodeURIComponent(paymentRef)}`);
      const paymentIntent = typeof session.payment_intent === "string" ? session.payment_intent : undefined;
      if (!paymentIntent) throw new Error(`Checkout Session ${paymentRef} has no payment to refund`);
      try {
        const params: Record<string, string> = { payment_intent: paymentIntent, "metadata[sectorId]": String(session.client_reference_id ?? "") };
        if (partial) {
          const amount = await partialRefundAmount(paymentIntent, partial);
          // Made already (Stripe keeps idempotency keys for 24 hours only), or nothing left to refund.
          if (amount <= 0) return;
          params.amount = String(amount);
          params["metadata[withdrawal]"] = partial.idempotencyKey;
        }
        await api.post("/refunds", params, partial ? `refund-${partial.idempotencyKey}-${partial.amountCents}` : `refund-${paymentRef}`);
      } catch (error) {
        // Refunded already (by hand in the dashboard, or by an earlier attempt): the goal is met.
        if (error instanceof StripeApiError && error.code === "charge_already_refunded") return;
        throw error;
      }
    }
  };
};
