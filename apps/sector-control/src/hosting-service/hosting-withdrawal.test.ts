// Withdrawal from the contract (Terms of Sale section 7; docs/legal-drafts/README.md
// items 1 and 6): until the end of the 14th day after payment and before the
// contest ends, the price less one thirtieth per started day open, for the
// quoted purchase only, closed at once and refunded until the refund is accepted.
import { describe, expect, it } from "vitest";

import { account, createHostingHarness, DAY, HOUR } from "../hosting-test-support.js";
import { openBar, pledge } from "./funding-test-support.js";
import { withdrawalQuote } from "./hosting-withdrawal.js";

describe("the withdrawal deduction", () => {
  it("is one thirtieth of what was paid for each started 24-hour period the sector was open", () => {
    const paid = 1_000_000;
    // Not open yet: everything back. The period runs to the end of the 14th day after payment.
    expect(withdrawalQuote("k", 2000, paid, undefined, paid + HOUR)).toMatchObject({ purchaseKey: "k", daysOpen: 0, deductionCents: 0, refundCents: 2000, deadline: paid + 15 * DAY });
    expect(withdrawalQuote("k", 2000, paid, paid, paid + HOUR)).toMatchObject({ daysOpen: 1, deductionCents: 67, refundCents: 1933 });
    expect(withdrawalQuote("k", 2000, paid, paid, paid + DAY)).toMatchObject({ daysOpen: 1, deductionCents: 67 });
    expect(withdrawalQuote("k", 2000, paid, paid, paid + DAY + 1)).toMatchObject({ daysOpen: 2, deductionCents: 133, refundCents: 1867 });
    // Never more than was paid.
    expect(withdrawalQuote("k", 2000, paid, paid, paid + 40 * DAY)).toMatchObject({ deductionCents: 2000, refundCents: 0 });
  });
});

describe("withdrawing from a hosted sector", () => {
  it("quotes first, then closes the sector and refunds the price less the days used, once", async () => {
    const h = await createHostingHarness();
    const sectorId = await h.openSector();
    expect(h.service.getSector(account("host"), sectorId)).toMatchObject({ ok: true, sector: { canWithdraw: true } });
    h.clock.now += 2 * DAY + HOUR;
    const quoted = h.service.quoteWithdrawal(account("host"), sectorId);
    if (!quoted.ok) throw new Error(quoted.code);
    expect(quoted.quote).toMatchObject({ purchaseKey: sectorId, daysOpen: 3, deductionCents: 200, refundCents: 1800 });
    // The quote changes nothing.
    expect(h.store.getSector(sectorId)?.state).toBe("open");
    expect(h.payment.partialRefunds.size).toBe(0);

    expect(await h.service.withdraw(account("host"), sectorId, quoted.quote.purchaseKey)).toMatchObject({ ok: true, refundPending: false, withdrawal: { refundCents: 1800, deductionCents: 200 } });
    const paymentRef = h.store.getSector(sectorId)?.paymentRef;
    expect([...h.payment.partialRefunds.values()]).toEqual([{ paymentRef, amountCents: 1800 }]);
    expect(h.store.getSector(sectorId)?.state).toBe("refunded");
    expect(h.alerts.map((alert) => alert.kind)).toContain("withdrawal");
    await h.reconciler.runOnce();
    expect(h.servers.servers.size).toBe(0);

    // A repeat (a lost reply, a second click) returns the same withdrawal and refunds nothing more.
    h.clock.now += DAY;
    expect(await h.service.withdraw(account("host"), sectorId, sectorId)).toMatchObject({ ok: true, withdrawal: { refundCents: 1800 } });
    expect(h.payment.partialRefunds.size).toBe(1);
    // Stripe's partial-refund event for it is not reported as a goodwill refund.
    await h.service.handlePaymentEvent({ eventId: "evt-withdrawal-refund", kind: "refunded", sectorId, fullRefund: false });
    expect(h.alerts.map((alert) => alert.kind)).not.toContain("partial_refund");
  });

  it("acts only on the purchase that was quoted", async () => {
    const h = await createHostingHarness();
    const sectorId = await h.openSector();
    expect(await h.service.withdraw(account("host"), sectorId, undefined)).toMatchObject({ ok: false, code: "WITHDRAWAL_NOT_AVAILABLE" });
    expect(await h.service.withdraw(account("host"), sectorId, "c-someone-elses-share")).toMatchObject({ ok: false, code: "WITHDRAWAL_NOT_AVAILABLE" });
    expect(h.store.getSector(sectorId)?.state).toBe("open");
    expect(h.payment.partialRefunds.size).toBe(0);
  });

  it("is open only to whoever paid, until the end of the 14th day after payment, and until the contest ends", async () => {
    const h = await createHostingHarness();
    const sectorId = await h.openSector();
    const invite = h.service.createInvite(account("host"), sectorId);
    if (!invite.ok) throw new Error(invite.code);
    h.service.acceptInvite(account("friend"), invite.invite.code);
    expect(h.service.quoteWithdrawal(account("friend"), sectorId)).toMatchObject({ ok: false, code: "WITHDRAWAL_NOT_AVAILABLE" });
    expect(h.service.getSector(account("friend"), sectorId)).toMatchObject({ ok: true, sector: { canWithdraw: false } });
    expect(h.service.quoteWithdrawal(account("stranger"), sectorId)).toMatchObject({ ok: false, code: "NOT_FOUND" });

    // Paid late in the evening: still possible late on the 14th day after.
    const paidAt = h.store.getSector(sectorId)?.paidAt ?? 0;
    h.clock.now = paidAt + 14 * DAY + 23 * HOUR;
    expect(h.service.quoteWithdrawal(account("host"), sectorId)).toMatchObject({ ok: true });
    h.clock.now = paidAt + 15 * DAY + 1;
    expect(h.service.quoteWithdrawal(account("host"), sectorId)).toMatchObject({ ok: false, code: "WITHDRAWAL_NOT_AVAILABLE", message: expect.stringMatching(/14-day/) });

    const ended = await h.openSector("other");
    h.store.transitionSector(ended, ["open"], { state: "ended", endedAt: h.clock.now }, h.clock.now);
    expect(await h.service.withdraw(account("other"), ended, ended)).toMatchObject({ ok: false, code: "WITHDRAWAL_NOT_AVAILABLE", message: expect.stringMatching(/Sector Contest ended/) });
    expect(h.payment.partialRefunds.size).toBe(0);
  });

  it("closes at once when the refund fails, and the reconciler sends the recorded refund later", async () => {
    const h = await createHostingHarness();
    const sectorId = await h.openSector();
    h.clock.now += HOUR;
    h.payment.failRefunds = true;
    expect(await h.service.withdraw(account("host"), sectorId, sectorId)).toMatchObject({ ok: true, refundPending: true, withdrawal: { refundCents: 1933 } });
    // Withdrawn means closed, whatever the payment provider does.
    expect(h.store.getSector(sectorId)?.state).toBe("refunded");
    expect(h.alerts.map((alert) => alert.kind)).toContain("sector_refund_failed");
    h.payment.failRefunds = false;
    h.clock.now += 3 * DAY;
    await h.reconciler.runOnce();
    expect([...h.payment.partialRefunds.values()].map((refund) => refund.amountCents)).toEqual([1933]);
    expect(h.store.listPendingWithdrawals()).toEqual([]);
  });

  it("refunds one person's share, removes them from the sector, and keeps it running for the others", async () => {
    const h = await createHostingHarness();
    const sectorId = openBar(h, ["friend"]);
    const share = await pledge(h, "friend", sectorId, 1200);
    await pledge(h, "host", sectorId, 800);
    await h.reconciler.runOnce();
    h.servers.healthy.add(`${sectorId}.sectors.invalid`);
    await h.reconciler.runOnce();
    expect(h.store.getSector(sectorId)?.state).toBe("open");
    h.clock.now += HOUR;
    const quoted = h.service.quoteWithdrawal(account("friend"), sectorId);
    if (!quoted.ok) throw new Error(quoted.code);
    expect(quoted.quote).toMatchObject({ paidCents: 1200, deductionCents: 40, refundCents: 1160 });
    expect(await h.service.withdraw(account("friend"), sectorId, quoted.quote.purchaseKey)).toMatchObject({ ok: true });
    expect([...h.payment.partialRefunds.values()]).toEqual([{ paymentRef: share, amountCents: 1160 }]);
    expect(h.store.getContribution(share.replace("fake-hold-", ""))?.state).toBe("refunded");
    // Having withdrawn, they no longer play in it.
    expect(await h.service.issueTicket(account("friend"), sectorId)).toMatchObject({ ok: false, code: "NOT_MEMBER" });
    expect(h.store.getSector(sectorId)?.state).toBe("open");
    // A repeat after a lost reply returns the same withdrawal.
    expect(await h.service.withdraw(account("friend"), sectorId, quoted.quote.purchaseKey)).toMatchObject({ ok: true, withdrawal: { refundCents: 1160 } });
    expect(h.payment.partialRefunds.size).toBe(1);
    // The host's own share is untouched and can still be withdrawn from.
    expect(h.service.getSector(account("host"), sectorId)).toMatchObject({ ok: true, sector: { canWithdraw: true } });
  });
});
