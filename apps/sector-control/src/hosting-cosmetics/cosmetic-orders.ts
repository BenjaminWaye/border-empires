// Selling a cosmetic product, such as "Claim the title of Count" (plan section
// 15, step 8e; Terms of Sale section 7a; docs/legal-drafts/ai-review-2026-11-28.md
// section 7, item 5).
//
// The order: both boxes ticked (18 or older and the Terms; delivery at once,
// losing the right to withdraw), not owned already, one Stripe payment. Once
// paid, the confirmation email that repeats the request and acknowledgement is
// written, and the item is granted only after that email has been sent:
// without it the buyer would keep the right to withdraw. A grant that has not
// happened within 24 hours of payment is refunded in full, as the Terms
// promise. A full refund or a lost dispute takes the item back.
//
// Every step is guarded by the order's state and safe to repeat, like the
// sector reconciler, so a restart at any moment simply carries on.
import { checkCosmeticConsent, COSMETIC_CONSENT_IMMEDIATE, COSMETIC_CONSENT_TERMS, cosmeticProduct, HOSTED_SECTOR_TERMS_VERSION } from "@border-empires/shared";

import type { HostingEmailOutbox } from "../hosting-email/hosting-email-outbox.js";
import { cosmeticOrderConfirmationEmail } from "../hosting-email/hosting-email-content.js";
import type { HostingConfig } from "../hosting-service/hosting-config.js";
import { PURCHASES_PAUSED_MESSAGE } from "../hosting-service/hosting-disputes.js";
import type { HostingAccount } from "../hosting-service/hosting-service.js";
import type { HostingStore } from "../hosting-store/hosting-store.js";
import type { HostingAlert, PaymentProvider } from "../providers/providers.js";
import type { CosmeticOrder, SqliteCosmeticOrderStore } from "./cosmetic-order-store.js";
import type { CosmeticPaymentEvent } from "./cosmetic-payment-event.js";
import { GatewayCosmeticsError, type GatewayCosmeticsClient } from "./gateway-cosmetics-client.js";

const HOUR = 60 * 60 * 1000;
/** Terms of Sale section 7a: not added within 24 hours of payment, refunded in full. */
export const COSMETIC_GRANT_DEADLINE_MS = 24 * HOUR;

export type CosmeticOrderErrorCode =
  | "SALES_CLOSED" | "ACCOUNT_REQUIRED" | "EMAIL_NOT_VERIFIED" | "NOT_FOUND" | "CONSENT_REQUIRED" | "TERMS_OUTDATED"
  | "PURCHASES_PAUSED" | "ALREADY_OWNED" | "PAYMENT_UNAVAILABLE";

type Fail = { ok: false; code: CosmeticOrderErrorCode; message: string };
const fail = (code: CosmeticOrderErrorCode, message: string): Fail => ({ ok: false, code, message });

/** What the shop shows for an order. */
export type CosmeticOrderView = { orderId: string; productId: string; state: CosmeticOrder["state"]; createdAt: number; checkoutUrl?: string };

export type CosmeticOrdersDeps = {
  orders: SqliteCosmeticOrderStore;
  /** Disputes and the payment-event log are shared with sector orders. */
  store: Pick<HostingStore, "hasOpenDispute" | "openDispute" | "closeDispute" | "hasPaymentEvent" | "recordPaymentEvent">;
  payment: PaymentProvider;
  gateway: GatewayCosmeticsClient;
  outbox: Pick<HostingEmailOutbox, "enqueue" | "get">;
  appUrl: string;
  config: Pick<HostingConfig, "salesEnabled" | "checkoutExpiryMs">;
  alert: HostingAlert;
  now: () => number;
  newId: (length: number) => string;
  /** Keeps the buyer's address for the confirmation email. */
  rememberAddress?: (account: HostingAccount) => void;
};

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error)).slice(0, 500);
const confirmationKey = (orderId: string): string => `cosmetic-order:${orderId}`;
const contents = (productId: string): string =>
  productId === "title-count" ? "the High-noble muster standard, the Lancet guard soldier look and the title of Count" : "the items listed in the shop";

const view = (order: CosmeticOrder): CosmeticOrderView => ({
  orderId: order.orderId, productId: order.productId, state: order.state, createdAt: order.createdAt,
  ...(order.state === "awaiting_payment" && order.checkoutUrl ? { checkoutUrl: order.checkoutUrl } : {})
});

export const createCosmeticOrders = (deps: CosmeticOrdersDeps) => {
  const { orders } = deps;

  /** Gives the money back for a paid order that will not be granted, or was paid after it was closed. */
  const refund = async (order: CosmeticOrder, reason: string, now: number): Promise<boolean> => {
    if (!order.paymentRef) return false;
    try {
      await deps.payment.refund(order.paymentRef);
    } catch (error) {
      // Told once; the next passes keep trying quietly.
      if (order.lastError === undefined) deps.alert("cosmetic_refund_failed", { cosmeticOrderId: order.orderId, error: errorText(error) });
      orders.transition(order.orderId, [order.state], { lastError: errorText(error) }, now);
      return false;
    }
    orders.transition(order.orderId, ["paid", "cancelled"], { state: "refunded", closeReason: reason }, now);
    deps.alert("cosmetic_refunded_automatically", { cosmeticOrderId: order.orderId, reason });
    return true;
  };

  /** A paid order: write the confirmation, grant once it is sent, refund when the deadline passes. */
  const deliver = async (order: CosmeticOrder, now: number): Promise<void> => {
    const product = cosmeticProduct(order.productId);
    const paidAt = order.paidAt ?? order.updatedAt;
    if (product && !deps.outbox.get(confirmationKey(order.orderId))) {
      deps.outbox.enqueue({
        emailKey: confirmationKey(order.orderId), kind: "order_confirmation", accountUid: order.accountUid, attachTermsVersion: order.consent.termsVersion,
        ...cosmeticOrderConfirmationEmail(deps.appUrl, {
          orderId: order.orderId, productName: product.name, contents: contents(product.id), amountCents: order.amountCents, currency: order.currency, paidAt, consent: order.consent
        })
      }, now);
    }
    const sent = deps.outbox.get(confirmationKey(order.orderId))?.sentAt !== undefined;
    if (sent && product) {
      try {
        await deps.gateway.grant(order.accountUid, order.productId, order.orderId);
        orders.transition(order.orderId, ["paid"], { state: "granted", grantedAt: now, lastError: null }, now);
        return;
      } catch (error) {
        orders.transition(order.orderId, ["paid"], { grantAttempts: order.grantAttempts + 1, lastError: errorText(error) }, now);
      }
    }
    if (now - paidAt >= COSMETIC_GRANT_DEADLINE_MS) await refund(order, sent ? "grant_failed" : "confirmation_not_sent", now);
  };

  /** A refunded order that had been granted: take the item back. An account deleted since owns nothing to take. */
  const takeBack = async (order: CosmeticOrder, now: number): Promise<void> => {
    try {
      await deps.gateway.revoke(order.accountUid, order.productId);
    } catch (error) {
      if (!(error instanceof GatewayCosmeticsError && error.status === 404)) {
        orders.transition(order.orderId, ["refunded"], { lastError: errorText(error) }, now);
        return;
      }
    }
    orders.transition(order.orderId, ["refunded"], { revokedAt: now, lastError: null }, now);
  };

  return {
    async createOrder(account: HostingAccount, productId: unknown, consent: unknown): Promise<{ ok: true; order: CosmeticOrderView } | Fail> {
      if (!deps.config.salesEnabled) return fail("SALES_CLOSED", "The shop is not open right now.");
      if (account.isGuest) return fail("ACCOUNT_REQUIRED", "Sign in with an account to buy.");
      if (!account.emailVerified) return fail("EMAIL_NOT_VERIFIED", "Verify your email address to buy.");
      const product = typeof productId === "string" ? cosmeticProduct(productId) : undefined;
      if (!product) return fail("NOT_FOUND", "No such item.");
      if (deps.store.hasOpenDispute(account.uid)) return fail("PURCHASES_PAUSED", PURCHASES_PAUSED_MESSAGE);
      const checked = checkCosmeticConsent(consent);
      if (checked === "missing") return fail("CONSENT_REQUIRED", "Tick both boxes to continue: being 18 or older and accepting the Terms of Sale, and asking for the item to be added now.");
      if (checked === "outdated") return fail("TERMS_OUTDATED", "The Terms of Sale have changed since this page was opened. Reload the page, read them, and tick both boxes again.");
      const open = orders.openOrder(account.uid, product.id);
      // A second press of Buy gets the same checkout back.
      if (open?.state === "awaiting_payment" && open.checkoutUrl) return { ok: true, order: view(open) };
      if (open) return fail("ALREADY_OWNED", "You already own this, or your payment for it is being processed.");
      try {
        if (await deps.gateway.owned(account.uid, product.id)) return fail("ALREADY_OWNED", "You already own this.");
      } catch {
        return fail("PAYMENT_UNAVAILABLE", "The shop cannot be reached right now. Nothing was charged; please try again.");
      }
      const now = deps.now();
      const orderId = `co-${deps.newId(12)}`;
      const inserted = orders.insert({
        orderId, accountUid: account.uid, productId: product.id, amountCents: product.priceUsdCents, currency: "usd", state: "awaiting_payment",
        createdAt: now, updatedAt: now, grantAttempts: 0,
        consent: { at: now, termsVersion: HOSTED_SECTOR_TERMS_VERSION, text: `${COSMETIC_CONSENT_TERMS}\n${COSMETIC_CONSENT_IMMEDIATE}` }
      });
      if (!inserted) return fail("ALREADY_OWNED", "You already own this, or your payment for it is being processed.");
      try {
        const checkout = await deps.payment.createProductCheckout({
          orderId, accountUid: account.uid, productId: product.id, productName: product.name, amountCents: product.priceUsdCents, currency: "usd", createdAt: now
        });
        orders.transition(orderId, ["awaiting_payment"], { paymentRef: checkout.paymentRef, checkoutUrl: checkout.checkoutUrl }, deps.now());
      } catch (error) {
        orders.transition(orderId, ["awaiting_payment"], { state: "cancelled", lastError: errorText(error) }, deps.now());
        return fail("PAYMENT_UNAVAILABLE", "Payment could not be started. Nothing was charged; please try again.");
      }
      deps.rememberAddress?.(account);
      const created = orders.get(orderId);
      if (!created) throw new Error(`cosmetic order ${orderId} vanished after insert`);
      return { ok: true, order: view(created) };
    },

    listOrders(account: HostingAccount): CosmeticOrderView[] {
      return orders.listForAccount(account.uid).map(view);
    },

    /** A verified event from the payment provider. Safe to repeat. */
    async handlePaymentEvent(event: CosmeticPaymentEvent): Promise<{ applied: boolean }> {
      if (deps.store.hasPaymentEvent(event.eventId)) return { applied: false };
      const now = deps.now();
      const order = orders.get(event.cosmeticOrderId);
      let applied = false;
      if (!order) {
        deps.alert("payment_for_unknown_sector", { cosmeticOrderId: event.cosmeticOrderId, kind: event.kind });
      } else if (event.kind === "paid") {
        applied = orders.transition(order.orderId, ["awaiting_payment"], { state: "paid", paidAt: now }, now);
        // Paid after we gave up on the checkout: the money goes back.
        if (!applied && order.state === "cancelled") applied = await refund(order, "paid_after_cancel", now);
      } else if (event.kind === "expired") {
        applied = orders.transition(order.orderId, ["awaiting_payment"], { state: "cancelled" }, now);
      } else if (event.kind === "refunded") {
        // A partial refund (goodwill) keeps the item; only a full one takes it back.
        if (event.fullRefund) applied = orders.transition(order.orderId, ["paid", "granted"], { state: "refunded", closeReason: "refund" }, now);
      } else if (event.kind === "disputed") {
        applied = deps.store.openDispute({ disputeId: event.disputeId, accountUid: order.accountUid, sectorId: order.orderId, openedAt: now });
        deps.alert("payment_dispute", { cosmeticOrderId: order.orderId, disputeId: event.disputeId });
      } else {
        applied = deps.store.closeDispute(event.disputeId, now);
        // Lost: the bank gave the money back to the buyer, so the item goes too (Terms of Sale section 7a).
        if (event.lost) orders.transition(order.orderId, ["paid", "granted"], { state: "refunded", closeReason: "dispute_lost" }, now);
        deps.alert("payment_dispute_closed", { cosmeticOrderId: order.orderId, disputeId: event.disputeId, lost: event.lost ? 1 : 0 });
      }
      deps.store.recordPaymentEvent(event.eventId, now);
      return { applied };
    },

    /** The reconciler's part, on every pass. A failure on one order never stops the others. */
    async runOnce(): Promise<void> {
      for (const order of orders.listActionable()) {
        const now = deps.now();
        try {
          if (order.state === "awaiting_payment") {
            // A webhook may have been missed.
            if (now - order.createdAt < deps.config.checkoutExpiryMs) continue;
            const status = order.paymentRef ? await deps.payment.getCheckoutStatus(order.paymentRef) : "expired";
            if (status === "paid") orders.transition(order.orderId, ["awaiting_payment"], { state: "paid", paidAt: now }, now);
            else if (status === "expired") orders.transition(order.orderId, ["awaiting_payment"], { state: "cancelled" }, now);
          } else if (order.state === "paid") await deliver(order, now);
          else await takeBack(order, now);
        } catch (error) {
          orders.transition(order.orderId, [order.state], { lastError: errorText(error) }, now);
        }
      }
    }
  };
};

export type CosmeticOrders = ReturnType<typeof createCosmeticOrders>;
