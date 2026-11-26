import { describe, expect, it } from "vitest";

import { createHostedSectorTicketVerifier } from "../../../realtime-gateway/src/hosted-sector/hosted-sector-ticket.js";
import { CONSENT, account, createHostingHarness, DAY } from "../hosting-test-support.js";

const STANDARD = { mapStyle: "continents", mapSize: "standard" } as const;

describe("ordering a hosted sector", () => {
  it("creates an unpaid order with a checkout, priced at USD 20, with the host as first member", async () => {
    const h = await createHostingHarness();
    const result = await h.service.createOrder(account("host"), { mapStyle: "islands", mapSize: "small" }, CONSENT);
    expect(result).toMatchObject({ ok: true, sector: { state: "awaiting_payment", role: "host", members: 1, humanPlaces: 12, options: { mapStyle: "islands", mapSize: "small" } } });
    if (!result.ok) return;
    expect(result.sector.checkoutUrl).toContain("checkout.invalid");
    expect(h.store.getSector(result.sector.sectorId)).toMatchObject({ amountCents: 2000, currency: "usd" });
  });

  it("gives a second press of Buy the same order back instead of a second one", async () => {
    const h = await createHostingHarness();
    const first = await h.order();
    const again = await h.service.createOrder(account("host"), STANDARD, CONSENT);
    expect(again).toMatchObject({ ok: true, sector: { sectorId: first } });
    expect(h.store.countSectorsByState().awaiting_payment).toBe(1);
  });

  it("refuses a second sector while one is being created or running, and allows one after it ends", async () => {
    const h = await createHostingHarness();
    const sectorId = await h.openSector();
    expect(await h.service.createOrder(account("host"), STANDARD, CONSENT)).toMatchObject({ ok: false, code: "ALREADY_HOSTING" });
    h.servers.ended.add(`${sectorId}.sectors.invalid`);
    await h.reconciler.runOnce();
    expect(await h.service.createOrder(account("host"), STANDARD, CONSENT)).toMatchObject({ ok: true });
  });

  it("refuses guests, unverified emails, and everyone while sales are switched off", async () => {
    const h = await createHostingHarness();
    expect(await h.service.createOrder(account("g", { isGuest: true }), STANDARD, CONSENT)).toMatchObject({ ok: false, code: "ACCOUNT_REQUIRED" });
    expect(await h.service.createOrder(account("u", { emailVerified: false }), STANDARD, CONSENT)).toMatchObject({ ok: false, code: "EMAIL_NOT_VERIFIED" });
    const closed = await createHostingHarness({ salesEnabled: false });
    expect(await closed.service.createOrder(account("host"), STANDARD, CONSENT)).toMatchObject({ ok: false, code: "SALES_CLOSED" });
    expect(closed.store.countSectorsByState().awaiting_payment).toBe(0);
  });

  it("cancels the order when the checkout cannot be created, and lets the player try again", async () => {
    const h = await createHostingHarness();
    const createCheckout = h.payment.createCheckout.bind(h.payment);
    h.payment.createCheckout = async () => { throw new Error("provider down"); };
    expect(await h.service.createOrder(account("host"), STANDARD, CONSENT)).toMatchObject({ ok: false, code: "PAYMENT_UNAVAILABLE" });
    expect(h.store.countSectorsByState().cancelled).toBe(1);
    h.payment.createCheckout = createCheckout;
    expect(await h.service.createOrder(account("host"), STANDARD, CONSENT)).toMatchObject({ ok: true });
  });
});

describe("payment events", () => {
  it("moves a paid order to creating exactly once, however often the event arrives", async () => {
    const h = await createHostingHarness();
    const sectorId = await h.order();
    expect(await h.service.handlePaymentEvent({ eventId: "evt-1", kind: "paid", sectorId })).toEqual({ applied: true });
    h.clock.now += 5_000;
    expect(await h.service.handlePaymentEvent({ eventId: "evt-1", kind: "paid", sectorId })).toEqual({ applied: false });
    expect(await h.service.handlePaymentEvent({ eventId: "evt-2", kind: "paid", sectorId })).toEqual({ applied: false });
    expect(h.store.getSector(sectorId)).toMatchObject({ state: "creating", paidAt: h.clock.now - 5_000 });
  });

  it("cancels an expired checkout and never lets a late expiry undo a payment", async () => {
    const h = await createHostingHarness();
    const expired = await h.order("a");
    await h.service.handlePaymentEvent({ eventId: "evt-1", kind: "expired", sectorId: expired });
    expect(h.store.getSector(expired)?.state).toBe("cancelled");
    const paid = await h.order("b");
    await h.service.handlePaymentEvent({ eventId: "evt-2", kind: "paid", sectorId: paid });
    await h.service.handlePaymentEvent({ eventId: "evt-3", kind: "expired", sectorId: paid });
    expect(h.store.getSector(paid)?.state).toBe("creating");
  });

  it("tells the owner about money for an order it does not know, and refunds money for one it had already closed", async () => {
    const h = await createHostingHarness();
    await h.service.handlePaymentEvent({ eventId: "evt-1", kind: "paid", sectorId: "s-unknown" });
    const sectorId = await h.order();
    await h.service.handlePaymentEvent({ eventId: "evt-2", kind: "expired", sectorId });
    await h.service.handlePaymentEvent({ eventId: "evt-3", kind: "paid", sectorId });
    expect(h.alerts.map((alert) => alert.kind)).toEqual(["payment_for_unknown_sector", "payment_for_unknown_sector"]);
    expect(h.payment.refunded).toEqual([`fake-pay-${sectorId}`]);
    expect(h.store.getSector(sectorId)?.state).toBe("cancelled");
  });

  it("throws when that refund fails, so the provider delivers the event again", async () => {
    const h = await createHostingHarness();
    const sectorId = await h.order();
    await h.service.handlePaymentEvent({ eventId: "evt-x", kind: "expired", sectorId });
    h.payment.failRefunds = true;
    await expect(h.service.handlePaymentEvent({ eventId: "evt-p", kind: "paid", sectorId })).rejects.toThrow();
    h.payment.failRefunds = false;
    await h.service.handlePaymentEvent({ eventId: "evt-p", kind: "paid", sectorId });
    expect(h.payment.refunded).toEqual([`fake-pay-${sectorId}`]);
  });

  it("ignores a repeated event entirely, alerts included", async () => {
    const h = await createHostingHarness();
    const sectorId = await h.openSector();
    await h.service.handlePaymentEvent({ eventId: "evt-d", kind: "disputed", sectorId });
    await h.service.handlePaymentEvent({ eventId: "evt-d", kind: "disputed", sectorId });
    expect(h.alerts.filter((alert) => alert.kind === "payment_dispute")).toHaveLength(1);
  });

  it("closes a sector the owner refunded and alerts on a dispute without closing anything", async () => {
    const h = await createHostingHarness();
    const sectorId = await h.openSector();
    await h.service.handlePaymentEvent({ eventId: "evt-d", kind: "disputed", sectorId });
    expect(h.store.getSector(sectorId)?.state).toBe("open");
    expect(h.alerts.at(-1)?.kind).toBe("payment_dispute");
    await h.service.handlePaymentEvent({ eventId: "evt-r", kind: "refunded", sectorId });
    expect(h.store.getSector(sectorId)?.state).toBe("refunded");
  });
});

describe("invitations and membership", () => {
  it("lets the host invite before paying, and a friend join with the link", async () => {
    const h = await createHostingHarness();
    const sectorId = await h.order();
    const invite = h.service.createInvite(account("host"), sectorId);
    expect(invite.ok).toBe(true);
    if (!invite.ok) return;
    expect(h.service.acceptInvite(account("friend"), invite.invite.code)).toMatchObject({ ok: true, sector: { sectorId, role: "member", members: 2 } });
    // Accepting twice is not an error and does not take a second place.
    expect(h.service.acceptInvite(account("friend"), invite.invite.code)).toMatchObject({ ok: true, sector: { members: 2 } });
    expect(h.service.listSectors(account("friend")).map((sector) => sector.sectorId)).toEqual([sectorId]);
  });

  it("hides a sector from non-members and keeps invites to the host", async () => {
    const h = await createHostingHarness();
    const sectorId = await h.order();
    expect(h.service.getSector(account("stranger"), sectorId)).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(h.service.createInvite(account("stranger"), sectorId)).toMatchObject({ ok: false, code: "NOT_FOUND" });
    const invite = h.service.createInvite(account("host"), sectorId);
    if (!invite.ok) throw new Error("invite failed");
    h.service.acceptInvite(account("friend"), invite.invite.code);
    expect(h.service.createInvite(account("friend"), sectorId)).toMatchObject({ ok: false, code: "NOT_HOST" });
    expect(h.service.revokeInvite(account("friend"), invite.invite.code)).toMatchObject({ ok: false, code: "NOT_HOST" });
    // A member never sees the host's checkout link.
    expect(h.service.getSector(account("friend"), sectorId)).toMatchObject({ ok: true, sector: { role: "member" } });
    expect(h.service.listSectors(account("friend"))[0]?.checkoutUrl).toBeUndefined();
  });

  it("refuses revoked and expired links, guests, and a full sector", async () => {
    const h = await createHostingHarness();
    const small = await h.service.createOrder(account("host"), { mapStyle: "continents", mapSize: "small" }, CONSENT);
    if (!small.ok) throw new Error("order failed");
    const sectorId = small.sector.sectorId;
    const make = (): string => {
      const invite = h.service.createInvite(account("host"), sectorId);
      if (!invite.ok) throw new Error(`invite failed: ${invite.code}`);
      return invite.invite.code;
    };
    const revoked = make();
    expect(h.service.revokeInvite(account("host"), revoked)).toEqual({ ok: true, revoked: true });
    expect(h.service.acceptInvite(account("a"), revoked)).toMatchObject({ ok: false, code: "INVITE_INVALID" });

    const code = make();
    expect(h.service.acceptInvite(account("guest", { isGuest: true }), code)).toMatchObject({ ok: false, code: "ACCOUNT_REQUIRED" });
    for (let index = 0; index < 11; index += 1) expect(h.service.acceptInvite(account(`friend-${index}`), code).ok).toBe(true);
    expect(h.service.acceptInvite(account("one-too-many"), code)).toMatchObject({ ok: false, code: "SECTOR_FULL" });

    h.clock.now += 31 * DAY;
    expect(h.service.acceptInvite(account("late"), code)).toMatchObject({ ok: false, code: "INVITE_INVALID" });
  });

  it("limits how many invite links a sector has at once", async () => {
    const h = await createHostingHarness({ maxActiveInvitesPerSector: 2 });
    const sectorId = await h.order();
    expect(h.service.createInvite(account("host"), sectorId).ok).toBe(true);
    expect(h.service.createInvite(account("host"), sectorId).ok).toBe(true);
    expect(h.service.createInvite(account("host"), sectorId)).toMatchObject({ ok: false, code: "TOO_MANY_INVITES" });
  });
});

describe("entering a sector", () => {
  it("issues a ticket the game server accepts, only to members, only once the sector is open", async () => {
    const h = await createHostingHarness();
    const sectorId = await h.order();
    expect(await h.service.issueTicket(account("host"), sectorId)).toMatchObject({ ok: false, code: "SECTOR_NOT_READY" });
    await h.service.handlePaymentEvent({ eventId: "evt-1", kind: "paid", sectorId });
    await h.reconciler.runOnce();
    h.servers.healthy.add(`${sectorId}.sectors.invalid`);
    await h.reconciler.runOnce();

    expect(await h.service.issueTicket(account("stranger"), sectorId)).toMatchObject({ ok: false, code: "NOT_MEMBER" });
    const issued = await h.service.issueTicket(account("host"), sectorId);
    expect(issued).toMatchObject({ ok: true, wsUrl: `wss://${sectorId}.sectors.invalid/ws`, expiresAt: h.clock.now + 600_000 });
    if (!issued.ok) return;

    // The other half of the contract: the gateway's own verifier.
    const verify = createHostedSectorTicketVerifier({ sectorId, ticketPublicKey: h.ticketPublicKey }, { now: () => h.clock.now });
    expect(await verify(issued.ticket, "host")).toEqual({ ok: true });
    expect(await verify(issued.ticket, "stranger")).toEqual({ ok: false, reason: "invalid_ticket" });
    const otherSector = createHostedSectorTicketVerifier({ sectorId: "s-other", ticketPublicKey: h.ticketPublicKey }, { now: () => h.clock.now });
    expect(await otherSector(issued.ticket, "host")).toEqual({ ok: false, reason: "invalid_ticket" });
  });
});
