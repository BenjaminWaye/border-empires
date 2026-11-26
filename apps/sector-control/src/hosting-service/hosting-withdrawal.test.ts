// Withdrawal from the contract (Terms of Sale section 7; docs/legal-drafts/README.md
// items 1 and 6): within 14 days and before the contest ends, the price less
// one thirtieth per started day the sector was open, confirmed in two steps.
import { describe, expect, it } from "vitest";

import { account, createHostingHarness, DAY, HOUR } from "../hosting-test-support.js";
import { openBar, pledge } from "./funding-test-support.js";
import { withdrawalQuote } from "./hosting-withdrawal.js";

describe("the withdrawal deduction", () => {
  it("is one thirtieth of what was paid for each started 24-hour period the sector was open", () => {
    const paid = 1_000_000;
    // Not open yet: everything back.
    expect(withdrawalQuote(2000, paid, undefined, paid + HOUR)).toMatchObject({ daysOpen: 0, deductionCents: 0, refundCents: 2000, deadline: paid + 14 * DAY });
    expect(withdrawalQuote(2000, paid, paid, paid + HOUR)).toMatchObject({ daysOpen: 1, deductionCents: 67, refundCents: 1933 });
    expect(withdrawalQuote(2000, paid, paid, paid + DAY)).toMatchObject({ daysOpen: 1, deductionCents: 67 });
    expect(withdrawalQuote(2000, paid, paid, paid + DAY + 1)).toMatchObject({ daysOpen: 2, deductionCents: 133, refundCents: 1867 });
    // Never more than was paid.
    expect(withdrawalQuote(2000, paid, paid, paid + 40 * DAY)).toMatchObject({ deductionCents: 2000, refundCents: 0 });
  });
});

describe("withdrawing from a hosted sector", () => {
  it("quotes first, then refunds the price less the days used and closes the sector", async () => {
    const h = await createHostingHarness();
    const sectorId = await h.openSector();
    expect(h.service.getSector(account("host"), sectorId)).toMatchObject({ ok: true, sector: { canWithdraw: true } });
    h.clock.now += 2 * DAY + HOUR;
    const quoted = h.service.quoteWithdrawal(account("host"), sectorId);
    expect(quoted).toMatchObject({ ok: true, quote: { daysOpen: 3, deductionCents: 200, refundCents: 1800 } });
    // The quote changes nothing.
    expect(h.store.getSector(sectorId)?.state).toBe("open");
    expect(h.payment.partialRefunds.size).toBe(0);

    expect(await h.service.withdraw(account("host"), sectorId)).toMatchObject({ ok: true, withdrawal: { refundCents: 1800, deductionCents: 200 } });
    const paymentRef = h.store.getSector(sectorId)?.paymentRef;
    expect([...h.payment.partialRefunds.values()]).toEqual([{ paymentRef, amountCents: 1800 }]);
    expect(h.store.getSector(sectorId)?.state).toBe("refunded");
    await h.reconciler.runOnce();
    expect(h.servers.servers.size).toBe(0);

    // A repeat returns the same withdrawal and refunds nothing more.
    h.clock.now += DAY;
    expect(await h.service.withdraw(account("host"), sectorId)).toMatchObject({ ok: true, withdrawal: { refundCents: 1800 } });
    expect(h.payment.partialRefunds.size).toBe(1);
    // Stripe's partial-refund event for it is not reported as a goodwill refund.
    await h.service.handlePaymentEvent({ eventId: "evt-withdrawal-refund", kind: "refunded", sectorId, fullRefund: false });
    expect(h.alerts.map((alert) => alert.kind)).not.toContain("partial_refund");
  });

  it("is open only to whoever paid, within 14 days, and until the contest ends", async () => {
    const h = await createHostingHarness();
    const sectorId = await h.openSector();
    const invite = h.service.createInvite(account("host"), sectorId);
    if (!invite.ok) throw new Error(invite.code);
    h.service.acceptInvite(account("friend"), invite.invite.code);
    expect(h.service.quoteWithdrawal(account("friend"), sectorId)).toMatchObject({ ok: false, code: "WITHDRAWAL_NOT_AVAILABLE" });
    expect(h.service.getSector(account("friend"), sectorId)).toMatchObject({ ok: true, sector: { canWithdraw: false } });
    expect(h.service.quoteWithdrawal(account("stranger"), sectorId)).toMatchObject({ ok: false, code: "NOT_FOUND" });

    h.clock.now += 14 * DAY + 1;
    expect(h.service.quoteWithdrawal(account("host"), sectorId)).toMatchObject({ ok: false, code: "WITHDRAWAL_NOT_AVAILABLE", message: expect.stringMatching(/14-day/) });

    const ended = await h.openSector("other");
    h.store.transitionSector(ended, ["open"], { state: "ended", endedAt: h.clock.now }, h.clock.now);
    expect(await h.service.withdraw(account("other"), ended)).toMatchObject({ ok: false, code: "WITHDRAWAL_NOT_AVAILABLE", message: expect.stringMatching(/Sector Contest ended/) });
    expect(h.payment.partialRefunds.size).toBe(0);
  });

  it("keeps the deduction it recorded when the refund has to be retried", async () => {
    const h = await createHostingHarness();
    const sectorId = await h.openSector();
    h.clock.now += HOUR;
    h.payment.failRefunds = true;
    expect(await h.service.withdraw(account("host"), sectorId)).toMatchObject({ ok: false, code: "PAYMENT_UNAVAILABLE" });
    expect(h.store.getSector(sectorId)?.state).toBe("open");
    h.payment.failRefunds = false;
    h.clock.now += 3 * DAY;
    expect(await h.service.withdraw(account("host"), sectorId)).toMatchObject({ ok: true, withdrawal: { refundCents: 1933 } });
    expect(h.store.getSector(sectorId)?.state).toBe("refunded");
  });

  it("refunds one person's share of a split-funded sector and keeps it running for the others", async () => {
    const h = await createHostingHarness();
    const sectorId = openBar(h, ["friend"]);
    const share = await pledge(h, "friend", sectorId, 1200);
    await pledge(h, "host", sectorId, 800);
    await h.reconciler.runOnce();
    h.servers.healthy.add(`${sectorId}.sectors.invalid`);
    await h.reconciler.runOnce();
    expect(h.store.getSector(sectorId)?.state).toBe("open");
    h.clock.now += HOUR;
    expect(h.service.quoteWithdrawal(account("friend"), sectorId)).toMatchObject({ ok: true, quote: { paidCents: 1200, deductionCents: 40, refundCents: 1160 } });
    expect(await h.service.withdraw(account("friend"), sectorId)).toMatchObject({ ok: true });
    expect([...h.payment.partialRefunds.values()]).toEqual([{ paymentRef: share, amountCents: 1160 }]);
    expect(h.store.getContribution(share.replace("fake-hold-", ""))?.state).toBe("refunded");
    expect(h.store.getSector(sectorId)?.state).toBe("open");
    // The host's own share is untouched and can still be withdrawn from.
    expect(h.service.getSector(account("host"), sectorId)).toMatchObject({ ok: true, sector: { canWithdraw: true } });
  });
});
