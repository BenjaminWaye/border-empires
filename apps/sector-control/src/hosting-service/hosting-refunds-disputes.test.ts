// A partial refund (goodwill for an outage) keeps a sector running, and an
// open payment dispute pauses the paying account's purchases until it closes
// (docs/legal-drafts/README.md, "What the code and settings must do before
// sales open", items 7 and 10).
import { describe, expect, it } from "vitest";

import { account, CONSENT, createHostingHarness } from "../hosting-test-support.js";
import { openBar, OPTIONS, pledge } from "./funding-test-support.js";

describe("partial refunds", () => {
  it("keeps a sector running for every member when only part of its price is given back", async () => {
    const h = await createHostingHarness();
    const sectorId = await h.openSector();
    expect(await h.service.handlePaymentEvent({ eventId: "evt-part", kind: "refunded", sectorId, fullRefund: false })).toEqual({ applied: false });
    expect(h.store.getSector(sectorId)?.state).toBe("open");
    expect(h.alerts.map((alert) => alert.kind)).toContain("partial_refund");
    await h.reconciler.runOnce();
    expect(h.servers.servers.size).toBe(1);
    // The whole price given back still closes it.
    await h.service.handlePaymentEvent({ eventId: "evt-full", kind: "refunded", sectorId, fullRefund: true });
    expect(h.store.getSector(sectorId)?.state).toBe("refunded");
  });

  it("keeps a share counted when only part of it is given back", async () => {
    const h = await createHostingHarness();
    const sectorId = openBar(h, ["friend"]);
    const share = await pledge(h, "friend", sectorId, 1000);
    await pledge(h, "host", sectorId, 1000);
    await h.reconciler.runOnce();
    const contributionId = share.replace("fake-hold-", "");
    await h.service.handlePaymentEvent({ eventId: "evt-part-share", kind: "refunded", contributionId, fullRefund: false });
    expect(h.store.getContribution(contributionId)?.state).toBe("captured");
    expect(h.alerts.map((alert) => alert.kind)).toContain("partial_refund");
    expect(h.alerts.map((alert) => alert.kind)).not.toContain("contribution_refunded");
  });
});

describe("payment disputes", () => {
  it("pauses the host's purchases while their dispute is open, and lifts the pause when it closes", async () => {
    const h = await createHostingHarness();
    const sectorId = await h.openSector();
    await h.service.handlePaymentEvent({ eventId: "evt-dispute", kind: "disputed", sectorId, disputeId: "dp_1" });
    // The sector itself is left as it is: what happens to it is the owner's call.
    expect(h.store.getSector(sectorId)?.state).toBe("open");
    expect(h.alerts.map((alert) => alert.kind)).toContain("payment_dispute");
    h.store.transitionSector(sectorId, ["open"], { state: "ended", endedAt: h.clock.now }, h.clock.now);
    h.store.transitionSector(sectorId, ["ended"], { state: "deleted" }, h.clock.now);
    expect(await h.service.createOrder(account("host"), OPTIONS, CONSENT)).toMatchObject({ ok: false, code: "PURCHASES_PAUSED" });
    expect(h.service.openFundingBar(account("host"), OPTIONS)).toMatchObject({ ok: false, code: "PURCHASES_PAUSED" });
    // Someone else is not affected.
    expect(await h.service.createOrder(account("other"), OPTIONS, CONSENT)).toMatchObject({ ok: true });

    await h.service.handlePaymentEvent({ eventId: "evt-dispute-closed", kind: "dispute_closed", sectorId, disputeId: "dp_1" });
    expect(await h.service.createOrder(account("host"), OPTIONS, CONSENT)).toMatchObject({ ok: true });
  });

  it("pauses a contributor's purchases, not the sector they chipped in to", async () => {
    const h = await createHostingHarness();
    const sectorId = openBar(h, ["friend"]);
    const share = await pledge(h, "friend", sectorId, 1000);
    await pledge(h, "host", sectorId, 1000);
    await h.reconciler.runOnce();
    const contributionId = share.replace("fake-hold-", "");
    await h.service.handlePaymentEvent({ eventId: "evt-share-dispute", kind: "disputed", contributionId, disputeId: "dp_2" });
    expect(h.store.getSector(sectorId)?.state).toBe("creating");
    expect(h.store.hasOpenDispute("friend")).toBe(true);
    expect(h.store.hasOpenDispute("host")).toBe(false);
    // Chipping in to another bar is a purchase too.
    const other = await h.service.openFundingBar(account("stranger"), OPTIONS);
    if (!other.ok) throw new Error(other.code);
    const invite = h.service.createInvite(account("stranger"), other.sector.sectorId);
    if (!invite.ok) throw new Error(invite.code);
    h.service.acceptInvite(account("friend"), invite.invite.code);
    expect(await h.service.contribute(account("friend"), other.sector.sectorId, 500, CONSENT)).toMatchObject({ ok: false, code: "PURCHASES_PAUSED" });
    await h.service.handlePaymentEvent({ eventId: "evt-share-dispute-closed", kind: "dispute_closed", contributionId, disputeId: "dp_2" });
    expect(h.store.hasOpenDispute("friend")).toBe(false);
  });

  it("records a dispute once, however often it is reported", async () => {
    const h = await createHostingHarness();
    expect(h.store.openDispute({ disputeId: "dp_9", accountUid: "a", sectorId: "s-x", openedAt: 1 })).toBe(true);
    expect(h.store.openDispute({ disputeId: "dp_9", accountUid: "a", sectorId: "s-x", openedAt: 2 })).toBe(false);
    expect(h.store.closeDispute("dp_9", 3)).toBe(true);
    expect(h.store.closeDispute("dp_9", 4)).toBe(false);
    expect(h.store.hasOpenDispute("a")).toBe(false);
  });
});
