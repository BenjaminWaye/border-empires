import { describe, expect, it } from "vitest";

import { account, createHostingHarness, DAY, HOUR, MINUTE } from "../hosting-test-support.js";
import { creationRetryDelayMs } from "./hosting-config.js";

const paid = async (h: Awaited<ReturnType<typeof createHostingHarness>>, uid = "host"): Promise<string> => {
  const sectorId = await h.order(uid);
  await h.service.handlePaymentEvent({ eventId: `evt-${sectorId}`, kind: "paid", sectorId });
  return sectorId;
};

describe("hosting reconciler: unpaid orders", () => {
  it("leaves a fresh order alone, then cancels one whose checkout expired", async () => {
    const h = await createHostingHarness();
    const sectorId = await h.order();
    await h.reconciler.runOnce();
    expect(h.store.getSector(sectorId)?.state).toBe("awaiting_payment");
    h.clock.now += 31 * MINUTE;
    h.payment.statuses.set(`fake-pay-${sectorId}`, "expired");
    await h.reconciler.runOnce();
    expect(h.store.getSector(sectorId)?.state).toBe("cancelled");
  });

  it("starts creation for a payment whose webhook never arrived", async () => {
    const h = await createHostingHarness();
    const sectorId = await h.order();
    h.payment.statuses.set(`fake-pay-${sectorId}`, "paid");
    h.clock.now += 31 * MINUTE;
    await h.reconciler.runOnce();
    expect(h.store.getSector(sectorId)?.state).toBe("creating");
  });

  it("does not cancel an order the provider still reports as open", async () => {
    const h = await createHostingHarness();
    const sectorId = await h.order();
    h.clock.now += 31 * MINUTE;
    await h.reconciler.runOnce();
    expect(h.store.getSector(sectorId)?.state).toBe("awaiting_payment");
  });
});

describe("hosting reconciler: creating a server", () => {
  it("requests one server, waits for it to be healthy, then opens the sector and announces it once", async () => {
    const h = await createHostingHarness();
    const sectorId = await paid(h);
    await h.reconciler.runOnce();
    await h.reconciler.runOnce();
    expect(h.servers.createCalls).toBe(1);
    expect(h.store.getSector(sectorId)).toMatchObject({ state: "creating", serverRef: `fake-server-${sectorId}` });

    h.servers.healthy.add(`${sectorId}.sectors.invalid`);
    await h.reconciler.runOnce();
    await h.reconciler.runOnce();
    expect(h.store.getSector(sectorId)).toMatchObject({ state: "open", openedAt: h.clock.now });
    expect(h.opened.map((sector) => sector.sectorId)).toEqual([sectorId]);
  });

  it("never requests a second server after a restart in the middle of creation", async () => {
    const h = await createHostingHarness();
    const sectorId = await paid(h);
    await h.reconciler.runOnce();
    // A new process: same database, fresh reconciler.
    const { createHostingReconciler } = await import("./hosting-reconciler.js");
    const restarted = createHostingReconciler({ store: h.store, payment: h.payment, servers: h.servers, alert: () => undefined, config: h.config, now: () => h.clock.now });
    h.servers.healthy.add(`${sectorId}.sectors.invalid`);
    await restarted.runOnce();
    expect(h.servers.createCalls).toBe(1);
    expect(h.store.getSector(sectorId)?.state).toBe("open");
  });

  it("alerts on the first failure, backs off, and recovers when the provider does", async () => {
    const h = await createHostingHarness();
    const sectorId = await paid(h);
    h.servers.failCreates = true;
    await h.reconciler.runOnce();
    await h.reconciler.runOnce();
    expect(h.servers.createCalls).toBe(1);
    expect(h.alerts.map((alert) => alert.kind)).toEqual(["sector_creation_failing"]);
    expect(h.service.getSector(account("host"), sectorId)).toMatchObject({ ok: true, sector: { state: "creating", delayed: true } });

    h.clock.now += creationRetryDelayMs(1);
    await h.reconciler.runOnce();
    expect(h.servers.createCalls).toBe(2);
    expect(h.alerts).toHaveLength(1);

    h.servers.failCreates = false;
    h.clock.now += creationRetryDelayMs(2);
    await h.reconciler.runOnce();
    h.servers.healthy.add(`${sectorId}.sectors.invalid`);
    await h.reconciler.runOnce();
    expect(h.store.getSector(sectorId)).toMatchObject({ state: "open" });
    expect(h.store.getSector(sectorId)?.lastError).toBeUndefined();
    expect(h.payment.refunded).toEqual([]);
  });

  it("refunds automatically when the sector is still not open 24 hours after payment", async () => {
    const h = await createHostingHarness();
    const sectorId = await paid(h);
    h.servers.failCreates = true;
    await h.reconciler.runOnce();
    h.clock.now += 24 * HOUR;
    await h.reconciler.runOnce();
    expect(h.store.getSector(sectorId)?.state).toBe("refunded");
    expect(h.payment.refunded).toEqual([`fake-pay-${sectorId}`]);
    expect(h.alerts.map((alert) => alert.kind)).toEqual(["sector_creation_failing", "sector_refunded_automatically"]);
  });

  it("deletes a half-made server when its order is refunded, and retries a refund that fails", async () => {
    const h = await createHostingHarness();
    const sectorId = await paid(h);
    await h.reconciler.runOnce();
    expect(h.servers.servers.size).toBe(1);
    h.payment.failRefunds = true;
    h.clock.now += 24 * HOUR;
    await h.reconciler.runOnce();
    expect(h.store.getSector(sectorId)?.state).toBe("creating");
    expect(h.alerts.at(-1)?.kind).toBe("sector_refund_failed");

    h.payment.failRefunds = false;
    h.clock.now += creationRetryDelayMs(1);
    await h.reconciler.runOnce();
    expect(h.store.getSector(sectorId)?.state).toBe("refunded");
    await h.reconciler.runOnce();
    expect(h.servers.servers.size).toBe(0);
    expect(h.store.getSector(sectorId)?.serverRef).toBeUndefined();
  });
});

describe("hosting reconciler: teardown", () => {
  it("keeps an ended sector up for the look-around period, then deletes its server", async () => {
    const h = await createHostingHarness();
    const sectorId = await h.openSector();
    h.servers.ended.add(`${sectorId}.sectors.invalid`);
    await h.reconciler.runOnce();
    expect(h.store.getSector(sectorId)).toMatchObject({ state: "ended", endedAt: h.clock.now });
    // Members can still enter to look at the final map.
    expect((await h.service.issueTicket(account("host"), sectorId)).ok).toBe(true);

    h.clock.now += 3 * DAY - MINUTE;
    await h.reconciler.runOnce();
    expect(h.servers.servers.size).toBe(1);
    h.clock.now += MINUTE;
    await h.reconciler.runOnce();
    expect(h.servers.servers.size).toBe(0);
    expect(h.store.getSector(sectorId)?.state).toBe("deleted");
    expect(await h.service.issueTicket(account("host"), sectorId)).toMatchObject({ ok: false, code: "SECTOR_NOT_READY" });
    // The sector stays in the member's list after its server is gone.
    expect(h.service.listSectors(account("host"))[0]).toMatchObject({ sectorId, state: "deleted" });
  });

  it("keeps the sector and alerts when the server cannot be deleted, then finishes later", async () => {
    const h = await createHostingHarness();
    const sectorId = await h.openSector();
    h.servers.ended.add(`${sectorId}.sectors.invalid`);
    await h.reconciler.runOnce();
    h.clock.now += 3 * DAY;
    h.servers.failDeletes = true;
    await h.reconciler.runOnce();
    expect(h.store.getSector(sectorId)?.state).toBe("ended");
    expect(h.alerts.at(-1)?.kind).toBe("sector_teardown_failed");
    h.servers.failDeletes = false;
    await h.reconciler.runOnce();
    expect(h.store.getSector(sectorId)?.state).toBe("deleted");
  });

  it("closes a sector no human has visited for 7 days, and keeps one that is being played", async () => {
    const h = await createHostingHarness();
    const idle = await h.openSector("a");
    const played = await h.openSector("b");
    h.clock.now += 7 * DAY - MINUTE;
    await h.reconciler.runOnce();
    expect(h.store.getSector(idle)?.state).toBe("open");

    h.servers.lastHumanVisitAt.set(`${played}.sectors.invalid`, h.clock.now);
    h.clock.now += MINUTE;
    await h.reconciler.runOnce();
    expect(h.store.getSector(idle)).toMatchObject({ state: "deleted", endedAt: h.clock.now });
    expect(h.servers.servers.has(`fake-server-${idle}`)).toBe(false);
    expect(h.alerts.at(-1)).toEqual({ kind: "sector_closed_idle", details: { sectorId: idle, idleDays: 7 } });
    expect(h.store.getSector(played)?.state).toBe("open");

    // A long contest that people keep visiting is never closed for its age.
    for (let week = 0; week < 20; week += 1) {
      h.clock.now += 6 * DAY;
      h.servers.lastHumanVisitAt.set(`${played}.sectors.invalid`, h.clock.now);
      await h.reconciler.runOnce();
    }
    expect(h.store.getSector(played)?.state).toBe("open");
    h.clock.now += 7 * DAY;
    await h.reconciler.runOnce();
    expect(h.store.getSector(played)?.state).toBe("deleted");
  });

  it("leaves an idle sector open when its server cannot be deleted, and tries again", async () => {
    const h = await createHostingHarness();
    const sectorId = await h.openSector();
    h.clock.now += 7 * DAY;
    h.servers.failDeletes = true;
    await h.reconciler.runOnce();
    expect(h.store.getSector(sectorId)?.state).toBe("open");
    expect(h.alerts.at(-1)?.kind).toBe("sector_teardown_failed");
    h.servers.failDeletes = false;
    await h.reconciler.runOnce();
    expect(h.store.getSector(sectorId)?.state).toBe("deleted");
  });

  it("deletes a server that was finished after its order was refunded", async () => {
    const h = await createHostingHarness();
    const sectorId = await paid(h);
    h.servers.duringCreate = async () => { await h.service.handlePaymentEvent({ eventId: "evt-r", kind: "refunded", sectorId, fullRefund: true }); };
    await h.reconciler.runOnce();
    expect(h.store.getSector(sectorId)?.state).toBe("refunded");
    expect(h.servers.servers.size).toBe(0);
  });

  it("reports a server that is still not healthy 30 minutes after payment, once", async () => {
    const h = await createHostingHarness();
    const sectorId = await paid(h);
    await h.reconciler.runOnce();
    expect(h.alerts).toHaveLength(0);
    h.clock.now += 31 * MINUTE;
    await h.reconciler.runOnce();
    await h.reconciler.runOnce();
    expect(h.alerts.map((alert) => alert.kind)).toEqual(["sector_creation_failing"]);
    expect(h.service.listSectors(account("host"))[0]?.delayed).toBe(true);
  });

  it("tells the owner once when an open sector's server stops answering, and again after it recovers", async () => {
    const h = await createHostingHarness();
    const sectorId = await h.openSector();
    h.servers.failStatus = true;
    await h.reconciler.runOnce();
    await h.reconciler.runOnce();
    expect(h.alerts.filter((alert) => alert.kind === "sector_unreachable")).toHaveLength(1);
    h.servers.failStatus = false;
    await h.reconciler.runOnce();
    expect(h.store.getSector(sectorId)?.lastError).toBeUndefined();
    h.servers.failStatus = true;
    await h.reconciler.runOnce();
    expect(h.alerts.filter((alert) => alert.kind === "sector_unreachable")).toHaveLength(2);
  });

  it("deletes the server of a running sector the owner refunded", async () => {
    const h = await createHostingHarness();
    const sectorId = await h.openSector();
    await h.service.handlePaymentEvent({ eventId: "evt-r", kind: "refunded", sectorId, fullRefund: true });
    await h.reconciler.runOnce();
    expect(h.servers.servers.size).toBe(0);
    expect(h.store.getSector(sectorId)?.state).toBe("refunded");
  });
});

describe("hosting reconciler: housekeeping", () => {
  it("tells the owner once when the number of running sectors reaches a mark", async () => {
    const h = await createHostingHarness({ runningCountAlertMarks: [2, 3] });
    await h.openSector("a");
    expect(h.alerts).toEqual([]);
    await h.openSector("b");
    await h.reconciler.runOnce();
    await h.openSector("c");
    expect(h.alerts.map((alert) => alert.details)).toEqual([{ running: 2, mark: 2 }, { running: 3, mark: 3 }]);
  });

  it("forgets processed payment events after the retention period", async () => {
    const h = await createHostingHarness();
    const sectorId = await paid(h);
    h.clock.now += 91 * DAY;
    await h.reconciler.runOnce();
    expect(h.store.recordPaymentEvent(`evt-${sectorId}`, h.clock.now)).toBe(true);
  });
});
