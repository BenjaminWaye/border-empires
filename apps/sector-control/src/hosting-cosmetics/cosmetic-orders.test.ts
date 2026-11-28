// Selling a cosmetic (Terms of Sale section 7a; AI review section 7, item 5):
// both boxes, not owned already, granted only after the confirmation email
// was sent, refunded in full if not granted within 24 hours, taken back on a
// full refund or a lost dispute.
import { currentCosmeticConsent } from "@border-empires/shared";
import { describe, expect, it } from "vitest";

import { account, createHostingHarness, MINUTE } from "../hosting-test-support.js";
import { SqliteCosmeticOrderStore } from "./cosmetic-order-store.js";
import { COSMETIC_GRANT_DEADLINE_MS, createCosmeticOrders } from "./cosmetic-orders.js";
import { GatewayCosmeticsError, type GatewayCosmeticsClient } from "./gateway-cosmetics-client.js";

const build = async (configOverrides: { salesEnabled?: boolean } = {}) => {
  const h = await createHostingHarness(configOverrides);
  const orders = new SqliteCosmeticOrderStore(h.db);
  orders.applySchema();
  const owned = new Set<string>();
  const gatewayCalls: string[] = [];
  const gatewayState = { down: false, noPlayer: false };
  const gateway: GatewayCosmeticsClient = {
    owned: async (uid, productId) => { if (gatewayState.down) throw new Error("down"); return owned.has(`${uid}/${productId}`); },
    grant: async (uid, productId) => {
      gatewayCalls.push(`grant ${uid}`);
      if (gatewayState.noPlayer) throw new GatewayCosmeticsError(404, "no_player");
      if (gatewayState.down) throw new Error("down");
      owned.add(`${uid}/${productId}`);
    },
    revoke: async (uid, productId) => { gatewayCalls.push(`revoke ${uid}`); owned.delete(`${uid}/${productId}`); }
  };
  let next = 0;
  const shop = createCosmeticOrders({
    orders, store: h.store, payment: h.payment, gateway, outbox: h.outbox, appUrl: "https://play.example.test", config: h.config,
    alert: (kind, details) => { h.alerts.push({ kind, details }); }, now: () => h.clock.now, newId: () => `order${(next += 1)}`,
    rememberAddress: h.mailer.rememberAddress
  });
  /** One reconciler pass: the shop's step, then the emails go out. */
  const pass = async (): Promise<void> => {
    await shop.runOnce();
    await h.mailer.runOnce();
  };
  const buy = async (uid = "buyer") => {
    const result = await shop.createOrder(account(uid), "title-count", currentCosmeticConsent());
    if (!result.ok) throw new Error(result.code);
    return result.order;
  };
  const pay = async (orderId: string, eventId = `evt-pay-${orderId}`) => shop.handlePaymentEvent({ eventId, kind: "paid", cosmeticOrderId: orderId });
  return { h, orders, owned, gatewayCalls, gatewayState, shop, pass, buy, pay };
};

describe("buying a cosmetic", () => {
  it("grants the bundle only after the confirmation email has gone out, with both statements quoted", async () => {
    const t = await build();
    const order = await t.buy();
    expect(order).toMatchObject({ orderId: "co-order1", state: "awaiting_payment", checkoutUrl: "https://checkout.invalid/fake-pay-co-order1" });
    await t.pay(order.orderId);
    // The email provider is down: no confirmation, so no grant.
    t.h.mail.failing = true;
    await t.pass();
    await t.pass();
    expect(t.gatewayCalls).toEqual([]);
    expect(t.orders.get(order.orderId)?.state).toBe("paid");
    t.h.mail.failing = false;
    t.h.clock.now += 10 * MINUTE;
    await t.pass();
    const confirmation = t.h.mail.sent.find((mail) => mail.subject.includes("Claim the title of Count"));
    expect(confirmation?.text).toContain('"I am 18 or older and I accept the Terms of Sale."');
    expect(confirmation?.text).toContain('"I ask for this item to be added to my account now, and I understand that I then lose my right to withdraw."');
    expect(t.gatewayCalls).toEqual([]);
    await t.pass();
    expect(t.gatewayCalls).toEqual(["grant buyer"]);
    expect(t.orders.get(order.orderId)).toMatchObject({ state: "granted" });
    expect(t.owned.has("buyer/title-count")).toBe(true);
  });

  it("refuses without both boxes, outside sales, to guests, and when the product is owned already", async () => {
    const t = await build();
    expect(await t.shop.createOrder(account("buyer"), "title-count", { ...currentCosmeticConsent(), requestedImmediateDelivery: false })).toMatchObject({ ok: false, code: "CONSENT_REQUIRED" });
    expect(await t.shop.createOrder(account("buyer"), "title-count", { ...currentCosmeticConsent(), termsVersion: "old" })).toMatchObject({ ok: false, code: "TERMS_OUTDATED" });
    expect(await t.shop.createOrder(account("guest", { isGuest: true }), "title-count", currentCosmeticConsent())).toMatchObject({ ok: false, code: "ACCOUNT_REQUIRED" });
    expect(await t.shop.createOrder(account("buyer"), "no-such-thing", currentCosmeticConsent())).toMatchObject({ ok: false, code: "NOT_FOUND" });
    t.owned.add("buyer/title-count");
    expect(await t.shop.createOrder(account("buyer"), "title-count", currentCosmeticConsent())).toMatchObject({ ok: false, code: "ALREADY_OWNED" });
    t.gatewayState.down = true;
    expect(await t.shop.createOrder(account("other"), "title-count", currentCosmeticConsent())).toMatchObject({ ok: false, code: "PAYMENT_UNAVAILABLE" });
    const closed = await build({ salesEnabled: false });
    expect(await closed.shop.createOrder(account("buyer"), "title-count", currentCosmeticConsent())).toMatchObject({ ok: false, code: "SALES_CLOSED" });
  });

  it("gives the same checkout back on a second press, and refuses a second order once paid", async () => {
    const t = await build();
    const first = await t.buy();
    expect((await t.buy()).orderId).toBe(first.orderId);
    await t.pay(first.orderId);
    expect(await t.shop.createOrder(account("buyer"), "title-count", currentCosmeticConsent())).toMatchObject({ ok: false, code: "ALREADY_OWNED" });
  });

  it("refunds in full when the item could not be added within 24 hours", async () => {
    const t = await build();
    const order = await t.buy();
    await t.pay(order.orderId);
    t.gatewayState.noPlayer = true;
    await t.pass();
    await t.pass();
    expect(t.orders.get(order.orderId)?.state).toBe("paid");
    t.h.clock.now += COSMETIC_GRANT_DEADLINE_MS;
    await t.pass();
    expect(t.orders.get(order.orderId)).toMatchObject({ state: "refunded", closeReason: "grant_failed" });
    expect(t.h.payment.refunded).toEqual(["fake-pay-co-order1"]);
    expect(t.h.alerts.map((alert) => alert.kind)).toContain("cosmetic_refunded_automatically");
  });

  it("takes the item back on a full refund or a lost dispute, but not on a partial refund", async () => {
    const t = await build();
    const order = await t.buy();
    await t.pay(order.orderId);
    await t.pass();
    await t.pass();
    expect(t.owned.has("buyer/title-count")).toBe(true);
    await t.shop.handlePaymentEvent({ eventId: "evt-partial", kind: "refunded", cosmeticOrderId: order.orderId, fullRefund: false });
    await t.pass();
    expect(t.owned.has("buyer/title-count")).toBe(true);
    await t.shop.handlePaymentEvent({ eventId: "evt-full", kind: "refunded", cosmeticOrderId: order.orderId, fullRefund: true });
    await t.pass();
    expect(t.owned.has("buyer/title-count")).toBe(false);
    expect(t.orders.get(order.orderId)).toMatchObject({ state: "refunded", closeReason: "refund", revokedAt: t.h.clock.now });

    // Bought again later, then disputed and lost.
    const again = await t.buy();
    await t.pay(again.orderId);
    await t.pass();
    await t.pass();
    await t.shop.handlePaymentEvent({ eventId: "evt-dispute", kind: "disputed", cosmeticOrderId: again.orderId, disputeId: "dp_1" });
    expect(await t.shop.createOrder(account("buyer"), "title-count", currentCosmeticConsent())).toMatchObject({ ok: false, code: "PURCHASES_PAUSED" });
    await t.shop.handlePaymentEvent({ eventId: "evt-dispute-closed", kind: "dispute_closed", cosmeticOrderId: again.orderId, disputeId: "dp_1", lost: true });
    await t.pass();
    expect(t.owned.has("buyer/title-count")).toBe(false);
    expect(t.orders.get(again.orderId)).toMatchObject({ state: "refunded", closeReason: "dispute_lost" });
  });

  it("finds a missed payment, cancels an abandoned checkout, and refunds a payment that arrives after", async () => {
    const t = await build();
    const paid = await t.buy("payer");
    const abandoned = await t.buy("leaver");
    t.h.payment.statuses.set("fake-pay-co-order1", "paid");
    t.h.payment.statuses.set("fake-pay-co-order2", "expired");
    t.h.clock.now += t.h.config.checkoutExpiryMs;
    await t.pass();
    expect(t.orders.get(paid.orderId)?.state).toBe("paid");
    expect(t.orders.get(abandoned.orderId)?.state).toBe("cancelled");
    await t.pay(abandoned.orderId);
    expect(t.orders.get(abandoned.orderId)).toMatchObject({ state: "refunded", closeReason: "paid_after_cancel" });
    // A repeated event changes nothing.
    expect(await t.pay(abandoned.orderId)).toEqual({ applied: false });
  });
});
