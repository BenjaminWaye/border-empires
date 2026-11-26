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

    async getCheckoutStatus(paymentRef): Promise<CheckoutStatus> {
      const session = await api.get(`/checkout/sessions/${encodeURIComponent(paymentRef)}`);
      if (session.status === "complete" && session.payment_status === "paid") return "paid";
      if (session.status === "expired") return "expired";
      return "open";
    },

    async refund(paymentRef) {
      const session = await api.get(`/checkout/sessions/${encodeURIComponent(paymentRef)}`);
      const paymentIntent = typeof session.payment_intent === "string" ? session.payment_intent : undefined;
      if (!paymentIntent) throw new Error(`Checkout Session ${paymentRef} has no payment to refund`);
      try {
        await api.post("/refunds", { payment_intent: paymentIntent, "metadata[sectorId]": String(session.client_reference_id ?? "") }, `refund-${paymentRef}`);
      } catch (error) {
        // Refunded already (by hand in the dashboard, or by an earlier attempt): the goal is met.
        if (error instanceof StripeApiError && error.code === "charge_already_refunded") return;
        throw error;
      }
    }
  };
};
