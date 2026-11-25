// Regressions for the reconciler's split-funding step: money is never taken
// twice, never more than the price, never after the deadline, and never
// forgotten when the payment provider answers badly.
import { describe, expect, it } from "vitest";

import { account, createHostingHarness, HOUR, MINUTE } from "../hosting-test-support.js";
import { openBar, pledge, type Harness } from "./funding-test-support.js";

/** Starts a share's checkout without paying it. Returns its payment ref. */
const startCheckout = async (h: Harness, uid: string, sectorId: string, amountCents: number): Promise<string> => {
  const result = await h.service.contribute(account(uid), sectorId, amountCents);
  if (!result.ok) throw new Error(result.code);
  return result.checkoutUrl.replace("https://checkout.invalid/", "");
};

/** Reports a started checkout as held, as Stripe's webhook would. */
const hold = async (h: Harness, paymentRef: string): Promise<void> => {
  h.payment.contributions.set(paymentRef, "held");
  const contributionId = paymentRef.replace("fake-hold-", "");
  await h.service.handlePaymentEvent({ eventId: `evt-held-${contributionId}`, kind: "held", contributionId });
};

const stateOf = (h: Harness, paymentRef: string) => h.store.getContribution(paymentRef.replace("fake-hold-", ""))?.state;

describe("split funding reconciler: capturing", () => {
  it("counts a share as paid when its capture went through but the answer was lost", async () => {
    const h = await createHostingHarness();
    const sectorId = openBar(h, ["friend"]);
    const friendShare = await pledge(h, "friend", sectorId, 1000);
    const hostShare = await pledge(h, "host", sectorId, 1000);
    h.payment.loseCaptureAnswers.add(hostShare);
    await h.reconciler.runOnce();
    expect(stateOf(h, hostShare)).toBe("captured");
    expect(h.payment.released).not.toContain(hostShare);
    expect(h.store.getSector(sectorId)?.state).toBe("creating");
    expect(h.payment.captured).toEqual([friendShare, hostShare]);
  });

  it("keeps a share held and tries again when a capture fails but the hold is still there", async () => {
    const h = await createHostingHarness();
    const sectorId = openBar(h, ["friend"]);
    await pledge(h, "friend", sectorId, 1000);
    const hostShare = await pledge(h, "host", sectorId, 1000);
    h.payment.failCaptures.add(hostShare);
    await h.reconciler.runOnce();
    expect(stateOf(h, hostShare)).toBe("held");
    expect(h.payment.released).toEqual([]);
    expect(h.store.getSector(sectorId)?.state).toBe("funding");
    h.payment.failCaptures.delete(hostShare);
    await h.reconciler.runOnce();
    expect(h.store.getSector(sectorId)?.state).toBe("creating");
  });

  it("takes only the part still needed from the share that crosses the price", async () => {
    const h = await createHostingHarness();
    const sectorId = openBar(h, ["a", "b"]);
    const aShare = await pledge(h, "a", sectorId, 700);
    // Both start paying for what is left at the same time; b's hold lands first.
    const hostShare = await startCheckout(h, "host", sectorId, 1300);
    const bShare = await startCheckout(h, "b", sectorId, 1000);
    h.clock.now += MINUTE;
    await hold(h, bShare);
    h.clock.now += MINUTE;
    await hold(h, hostShare);
    await h.reconciler.runOnce();
    expect([...h.payment.capturedAmounts]).toEqual([[aShare, 700], [bShare, 1000], [hostShare, 300]]);
    expect(h.store.getContribution(hostShare.replace("fake-hold-", ""))).toMatchObject({ state: "captured", amountCents: 300 });
    expect(h.store.getSector(sectorId)?.state).toBe("creating");
  });

  it("closes everyone else's open checkout once the bar is full", async () => {
    const h = await createHostingHarness();
    const sectorId = openBar(h, ["friend", "late"]);
    const lateShare = await startCheckout(h, "late", sectorId, 500);
    await pledge(h, "friend", sectorId, 1000);
    await pledge(h, "host", sectorId, 1000);
    await h.reconciler.runOnce();
    expect(h.store.getSector(sectorId)?.state).toBe("creating");
    expect(h.payment.released).toEqual([lateShare]);
    expect(stateOf(h, lateShare)).toBe("cancelled");
  });
});

describe("split funding reconciler: the deadline", () => {
  it("does not charge anyone for a bar filled by a hold placed after the deadline", async () => {
    const h = await createHostingHarness();
    const sectorId = openBar(h, ["friend"]);
    const friendShare = await pledge(h, "friend", sectorId, 1000);
    const hostShare = await startCheckout(h, "host", sectorId, 1000);
    h.clock.now += 72 * HOUR;
    // The webhook was missed; the reconciler finds the hold only now.
    h.payment.contributions.set(hostShare, "held");
    await h.reconciler.runOnce();
    expect(h.payment.captured).toEqual([]);
    expect(h.payment.released.sort()).toEqual([friendShare, hostShare].sort());
    expect(h.store.getSector(sectorId)?.state).toBe("cancelled");
  });

  it("still gives everything back at the deadline when one share's status cannot be read", async () => {
    const h = await createHostingHarness();
    const sectorId = openBar(h, ["friend"]);
    const friendShare = await pledge(h, "friend", sectorId, 1000);
    const hostShare = await startCheckout(h, "host", sectorId, 500);
    h.payment.failStatus.add(hostShare);
    h.clock.now += 72 * HOUR;
    await h.reconciler.runOnce();
    expect(h.payment.released).toEqual(expect.arrayContaining([friendShare, hostShare]));
    expect(h.store.getSector(sectorId)?.state).toBe("cancelled");
  });

  it("refunds a share recorded as held whose money was in fact taken", async () => {
    const h = await createHostingHarness();
    const sectorId = openBar(h, ["friend"]);
    const share = await pledge(h, "friend", sectorId, 1000);
    // Captured at the provider, but the record never heard (a crash between the two).
    h.payment.contributions.set(share, "captured");
    h.clock.now += 72 * HOUR;
    await h.reconciler.runOnce();
    expect(h.payment.refunded).toEqual([share]);
    expect(stateOf(h, share)).toBe("refunded");
    expect(h.store.getSector(sectorId)?.state).toBe("cancelled");
  });
});
