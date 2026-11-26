import { describe, expect, it } from "vitest";

import { CONSENT, account, createHostingHarness, HOUR, MINUTE } from "../hosting-test-support.js";
import { funding, openBar, OPTIONS, pledge } from "./funding-test-support.js";

describe("split funding: filling the bar", () => {
  it("holds each share, then charges them all and starts the sector once the bar is full", async () => {
    const h = await createHostingHarness();
    const sectorId = openBar(h, ["friend"]);
    expect(h.store.getSector(sectorId)).toMatchObject({ state: "funding", fundingDeadline: h.clock.now + 72 * HOUR });

    const friendShare = await pledge(h, "friend", sectorId, 1200);
    expect(funding(h, "friend", sectorId)).toMatchObject({ targetCents: 2000, pledgedCents: 1200, yourCents: 1200, minimumCents: 500 });
    await h.reconciler.runOnce();
    // Not full: nothing is charged yet.
    expect(h.payment.captured).toEqual([]);

    // The host pays the rest, less than the minimum because that is all that is left.
    const hostShare = await pledge(h, "host", sectorId, 800);
    await h.reconciler.runOnce();
    expect(h.payment.captured).toEqual([friendShare, hostShare]);
    expect(h.store.getSector(sectorId)).toMatchObject({ state: "creating", paidAt: h.clock.now });
  });

  it("enforces the minimum share, the amount left and membership; a new pledge replaces the member's unfinished one", async () => {
    const h = await createHostingHarness();
    const sectorId = openBar(h, ["friend"]);
    expect(await h.service.contribute(account("friend"), sectorId, 400, CONSENT)).toMatchObject({ ok: false, code: "BAD_AMOUNT" });
    expect(await h.service.contribute(account("friend"), sectorId, 2100, CONSENT)).toMatchObject({ ok: false, code: "BAD_AMOUNT" });
    expect(await h.service.contribute(account("friend"), sectorId, 12.5, CONSENT)).toMatchObject({ ok: false, code: "BAD_AMOUNT" });
    expect(await h.service.contribute(account("stranger"), sectorId, 500, CONSENT)).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(await h.service.contribute(account("friend", { isGuest: true }), sectorId, 500, CONSENT)).toMatchObject({ ok: false, code: "ACCOUNT_REQUIRED" });
    const first = await h.service.contribute(account("friend"), sectorId, 1500, CONSENT);
    if (!first.ok) throw new Error(first.code);
    // A checkout in progress does not lock the bar: someone who starts paying and leaves blocks nobody.
    expect(await h.service.contribute(account("host"), sectorId, 2000, CONSENT)).toMatchObject({ ok: true });
    // Pledging again closes the member's earlier page first, so they cannot pay twice.
    expect(await h.service.contribute(account("friend"), sectorId, 500, CONSENT)).toMatchObject({ ok: true });
    const firstRef = first.checkoutUrl.replace("https://checkout.invalid/", "");
    expect(h.payment.released).toContain(firstRef);
    expect(h.store.getContribution(firstRef.replace("fake-hold-", ""))?.state).toBe("cancelled");
  });

  it("allows one open bar or live sector per account", async () => {
    const h = await createHostingHarness();
    openBar(h);
    expect(h.service.openFundingBar(account("host"), OPTIONS)).toMatchObject({ ok: false, code: "ALREADY_HOSTING" });
    expect(await h.service.createOrder(account("host"), OPTIONS, CONSENT)).toMatchObject({ ok: false, code: "ALREADY_HOSTING" });
  });

  it("never charges more than the price: a share held after the bar filled is released", async () => {
    const h = await createHostingHarness();
    const sectorId = openBar(h, ["a", "b"]);
    await pledge(h, "a", sectorId, 1500);
    // b's checkout stays open while the host fills the bar.
    const late = await h.service.contribute(account("b"), sectorId, 500, CONSENT);
    if (!late.ok) throw new Error(late.code);
    h.clock.now += 31 * MINUTE;
    await pledge(h, "host", sectorId, 500);
    const lateRef = late.checkoutUrl.replace("https://checkout.invalid/", "");
    h.clock.now += MINUTE;
    h.payment.contributions.set(lateRef, "held");
    await h.service.handlePaymentEvent({ eventId: "evt-late", kind: "held", contributionId: lateRef.replace("fake-hold-", "") });
    await h.reconciler.runOnce();
    expect(h.payment.captured).toHaveLength(2);
    expect(h.payment.released).toEqual([lateRef]);
    expect(h.store.getSector(sectorId)?.state).toBe("creating");
  });
});

describe("split funding: when the bar does not fill", () => {
  it("releases every hold at the 72-hour deadline, charges nobody, and closes the bar", async () => {
    const h = await createHostingHarness();
    const sectorId = openBar(h, ["friend"]);
    const share = await pledge(h, "friend", sectorId, 1000);
    h.clock.now += 72 * HOUR;
    await h.reconciler.runOnce();
    expect(h.payment.released).toEqual([share]);
    expect(h.payment.captured).toEqual([]);
    expect(h.store.getSector(sectorId)?.state).toBe("cancelled");
    expect(await h.service.contribute(account("friend"), sectorId, 500, CONSENT)).toMatchObject({ ok: false, code: "FUNDING_CLOSED" });
  });

  it("releases at once a share whose payment completes after its bar closed", async () => {
    const h = await createHostingHarness();
    const sectorId = openBar(h, ["friend"]);
    const late = await h.service.contribute(account("friend"), sectorId, 1000, CONSENT);
    if (!late.ok) throw new Error(late.code);
    h.clock.now += 72 * HOUR;
    await h.reconciler.runOnce();
    const ref = late.checkoutUrl.replace("https://checkout.invalid/", "");
    await h.service.handlePaymentEvent({ eventId: "evt-too-late", kind: "held", contributionId: ref.replace("fake-hold-", "") });
    expect(h.payment.released).toContain(ref);
    expect(h.store.getContribution(ref.replace("fake-hold-", ""))?.state).toBe("released");
  });

  it("drops a share whose hold lapsed, keeps the bar open, and refunds what was taken if it then lapses", async () => {
    const h = await createHostingHarness();
    const sectorId = openBar(h, ["friend"]);
    const friendShare = await pledge(h, "friend", sectorId, 1000);
    const hostShare = await pledge(h, "host", sectorId, 1000);
    h.payment.failCaptures.add(hostShare);
    h.payment.contributions.set(hostShare, "released");
    await h.reconciler.runOnce();
    expect(h.alerts.map((alert) => alert.kind)).toContain("contribution_capture_failed");
    expect(h.store.getSector(sectorId)?.state).toBe("funding");
    expect(funding(h, "host", sectorId)).toMatchObject({ pledgedCents: 1000 });
    h.clock.now += 72 * HOUR;
    await h.reconciler.runOnce();
    expect(h.payment.refunded).toEqual([friendShare]);
    expect(h.store.getSector(sectorId)?.state).toBe("cancelled");
  });
});

describe("split funding: after the sector started", () => {
  it("refunds every share when the sector cannot be created within 24 hours", async () => {
    const h = await createHostingHarness();
    const sectorId = openBar(h, ["friend"]);
    const a = await pledge(h, "friend", sectorId, 1000);
    const b = await pledge(h, "host", sectorId, 1000);
    await h.reconciler.runOnce();
    h.servers.failCreates = true;
    h.clock.now += 25 * HOUR;
    await h.reconciler.runOnce();
    expect(h.payment.refunded.sort()).toEqual([a, b].sort());
    expect(h.store.getSector(sectorId)?.state).toBe("refunded");
  });

  it("keeps the sector running when one person's share is refunded, and tells the owner", async () => {
    const h = await createHostingHarness();
    const sectorId = openBar(h, ["friend"]);
    const share = await pledge(h, "friend", sectorId, 1000);
    await pledge(h, "host", sectorId, 1000);
    await h.reconciler.runOnce();
    const contributionId = share.replace("fake-hold-", "");
    await h.service.handlePaymentEvent({ eventId: "evt-withdraw", kind: "refunded", contributionId, fullRefund: true });
    expect(h.store.getContribution(contributionId)?.state).toBe("refunded");
    expect(h.store.getSector(sectorId)?.state).toBe("creating");
    expect(h.alerts.map((alert) => alert.kind)).toContain("contribution_refunded");
  });
});
