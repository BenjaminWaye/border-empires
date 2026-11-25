// Split funding through Stripe (plan section 12): each share is a Checkout
// Session that only holds the money on the card (manual capture). When the
// bar fills, every hold is captured; if the deadline passes first, every hold
// is cancelled and nobody is charged. A card hold lasts about 7 days, longer
// than the 72-hour deadline.
import type { ContributionStatus, PaymentProvider } from "../providers.js";
import { StripeApiError, type StripeApi } from "./stripe-api.js";

type ContributionMethods = Pick<PaymentProvider, "createContributionCheckout" | "getContributionStatus" | "capture" | "release">;

/** Shown above the button on a share's Checkout page. */
export const CONTRIBUTION_CONSENT_TEXT =
  "Your card is only held now. You are charged when the funding bar is full, and the sector then starts at once; if the bar does not fill within 72 hours, the hold is released and you pay nothing. See the Terms of Sale.";

/** Counted from the share's creation, so a repeated request sends identical parameters (as for single-host checkout). */
const CONTRIBUTION_CHECKOUT_LIFETIME_SECONDS = 35 * 60;

export const createStripeContributionMethods = (api: StripeApi, config: { returnOrigin: string; taxCode: string; productName: (options: Parameters<PaymentProvider["createContributionCheckout"]>[0]["options"]) => string }): ContributionMethods => {
  const origin = config.returnOrigin.replace(/\/+$/, "");

  const sessionOf = (paymentRef: string) => api.get(`/checkout/sessions/${encodeURIComponent(paymentRef)}`);
  const intentOf = async (paymentRef: string): Promise<{ id: string; status: string } | undefined> => {
    const session = await sessionOf(paymentRef);
    const id = typeof session.payment_intent === "string" ? session.payment_intent : undefined;
    if (!id) return undefined;
    const intent = await api.get(`/payment_intents/${encodeURIComponent(id)}`);
    return { id, status: String(intent.status) };
  };

  return {
    async createContributionCheckout(input) {
      const back = (result: string): string => `${origin}/?hosted=${result}&sector=${encodeURIComponent(input.sectorId)}`;
      const params: Record<string, string> = {
        mode: "payment",
        client_reference_id: input.sectorId,
        "metadata[sectorId]": input.sectorId,
        "metadata[contributionId]": input.contributionId,
        "metadata[accountUid]": input.accountUid,
        "payment_intent_data[metadata][sectorId]": input.sectorId,
        "payment_intent_data[metadata][contributionId]": input.contributionId,
        // Hold now, charge when the bar is full.
        "payment_intent_data[capture_method]": "manual",
        // Cards support holding; some other methods cannot.
        "payment_method_types[0]": "card",
        "line_items[0][quantity]": "1",
        "line_items[0][price_data][currency]": input.currency,
        "line_items[0][price_data][unit_amount]": String(input.amountCents),
        "line_items[0][price_data][tax_behavior]": "inclusive",
        "line_items[0][price_data][product_data][name]": `Share of a ${config.productName(input.options).replace(/^Hosted sector/, "hosted sector")}`,
        "line_items[0][price_data][product_data][tax_code]": config.taxCode,
        "automatic_tax[enabled]": "true",
        billing_address_collection: "required",
        "custom_text[submit][message]": CONTRIBUTION_CONSENT_TEXT,
        success_url: back("pledged"),
        cancel_url: back("cancelled"),
        expires_at: String(Math.floor(input.createdAt / 1000) + CONTRIBUTION_CHECKOUT_LIFETIME_SECONDS)
      };
      const session = await api.post("/checkout/sessions", params, `contribution-${input.contributionId}`);
      if (typeof session.id !== "string" || typeof session.url !== "string") throw new Error("Stripe returned a Checkout Session without an id or url");
      return { paymentRef: session.id, checkoutUrl: session.url };
    },

    async getContributionStatus(paymentRef): Promise<ContributionStatus> {
      const session = await sessionOf(paymentRef);
      if (session.status === "expired") return "expired";
      if (session.status !== "complete") return "open";
      const intent = await intentOf(paymentRef);
      if (intent?.status === "requires_capture" || intent?.status === "succeeded") return "held";
      return intent?.status === "canceled" ? "expired" : "open";
    },

    async capture(paymentRef) {
      const intent = await intentOf(paymentRef);
      if (!intent) throw new Error(`Checkout Session ${paymentRef} has no payment to capture`);
      if (intent.status === "succeeded") return;
      if (intent.status !== "requires_capture") throw new Error(`payment ${intent.id} cannot be captured (${intent.status})`);
      await api.post(`/payment_intents/${encodeURIComponent(intent.id)}/capture`, {}, `capture-${paymentRef}`);
    },

    async release(paymentRef) {
      const session = await sessionOf(paymentRef);
      if (session.status === "open") {
        // Not paid yet: close the page so it can no longer be paid.
        try {
          await api.post(`/checkout/sessions/${encodeURIComponent(paymentRef)}/expire`, {});
        } catch (error) {
          // Completed or expired in the meantime; the hold, if any, is handled below on the next call.
          if (!(error instanceof StripeApiError)) throw error;
        }
        return;
      }
      const intent = await intentOf(paymentRef);
      if (!intent || intent.status === "canceled") return;
      if (intent.status === "succeeded") throw new Error(`payment ${intent.id} was already captured; refund it instead`);
      await api.post(`/payment_intents/${encodeURIComponent(intent.id)}/cancel`, {}, `release-${paymentRef}`);
    }
  };
};
