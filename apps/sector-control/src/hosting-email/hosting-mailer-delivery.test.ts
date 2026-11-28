// How email delivery shapes closing an idle sector (Terms of Sale section 5),
// and how the outbox handles a provider that refuses or is down.
import { describe, expect, it } from "vitest";

import { createHostingReconciler } from "../hosting-service/hosting-reconciler.js";
import { account, createHostingHarness, DAY, HOUR, MINUTE, TERMS_HTML } from "../hosting-test-support.js";
import { ADDRESS_RETENTION_MS, createHostingMailer, IDLE_WARNING_MAX_WAIT_MS, termsAttachment } from "./hosting-mailer.js";
import { PermanentEmailError } from "./resend-email-transport.js";

type Harness = Awaited<ReturnType<typeof createHostingHarness>>;

const warningsFor = (h: Harness, sectorId: string): string[] =>
  h.mail.sent.filter((message) => message.subject.startsWith(`Sector ${sectorId} closes on`)).map((message) => message.to);

/** The same service with emails switched off: no Resend key, so nothing can go out. */
const withoutEmail = (h: Harness) =>
  createHostingReconciler({
    store: h.store, payment: h.payment, servers: h.servers, config: h.config, now: () => h.clock.now,
    alert: (kind, details) => { h.alerts.push({ kind, details }); },
    mailer: createHostingMailer({ store: h.store, outbox: h.outbox, appUrl: "https://play.example.test", now: () => h.clock.now, alert: (kind, details) => { h.alerts.push({ kind, details }); } })
  });

describe("closing an idle sector", () => {
  it("closes a sector with no members left after 7 days: there is nobody to warn", async () => {
    const h = await createHostingHarness();
    const sectorId = await h.openSector();
    h.store.removeMember(sectorId, "host");
    h.clock.now += 7 * DAY;
    await h.reconciler.runOnce();
    expect(h.store.getSector(sectorId)?.state).toBe("deleted");
  });

  it("waits while the warning cannot be delivered, closes 2 days after it is, and tells the owner if it never is", async () => {
    const h = await createHostingHarness();
    const sectorId = await h.openSector();
    h.mail.failing = true;
    h.clock.now += 7 * DAY;
    await h.reconciler.runOnce();
    h.clock.now += 3 * DAY;
    await h.reconciler.runOnce();
    // Written 3 days ago but not delivered: still open.
    expect(h.store.getSector(sectorId)?.state).toBe("open");

    h.mail.failing = false;
    h.clock.now += 6 * HOUR;
    await h.reconciler.runOnce();
    expect(warningsFor(h, sectorId)).toEqual(["host@example.test"]);
    h.clock.now += 2 * DAY - MINUTE;
    await h.reconciler.runOnce();
    expect(h.store.getSector(sectorId)?.state).toBe("open");
    h.clock.now += MINUTE;
    await h.reconciler.runOnce();
    expect(h.store.getSector(sectorId)?.state).toBe("deleted");
    expect(h.alerts.find((alert) => alert.kind === "sector_closed_idle")?.details).toMatchObject({ unwarned: 0 });

    // A provider down for good: the sector does not run for ever.
    const other = await h.openSector("second");
    h.mail.failing = true;
    h.clock.now += 7 * DAY;
    await h.reconciler.runOnce();
    for (let hours = 0; hours < IDLE_WARNING_MAX_WAIT_MS / HOUR + 6; hours += 6) {
      h.clock.now += 6 * HOUR;
      await h.reconciler.runOnce();
    }
    expect(h.store.getSector(other)?.state).toBe("deleted");
    expect(h.alerts.filter((alert) => alert.kind === "sector_closed_idle").at(-1)?.details).toMatchObject({ sectorId: other, unwarned: 1 });
  });

  it("with emails switched off, closes 2 days after the warning was written and tells the owner", async () => {
    const h = await createHostingHarness();
    const sectorId = await h.openSector();
    const reconciler = withoutEmail(h);
    h.clock.now += 7 * DAY;
    await reconciler.runOnce();
    h.clock.now += 2 * DAY - MINUTE;
    await reconciler.runOnce();
    expect(h.store.getSector(sectorId)?.state).toBe("open");
    h.clock.now += MINUTE;
    await reconciler.runOnce();
    expect(h.store.getSector(sectorId)?.state).toBe("deleted");
    expect(h.alerts.find((alert) => alert.kind === "sector_closed_idle")?.details).toMatchObject({ unwarned: 1 });
  });

  it("does not send a warning about a sector that closed before it went out", async () => {
    const h = await createHostingHarness();
    const sectorId = await h.openSector();
    const reconciler = withoutEmail(h);
    h.clock.now += 7 * DAY;
    await reconciler.runOnce();
    h.clock.now += 2 * DAY;
    await reconciler.runOnce();
    expect(h.store.getSector(sectorId)?.state).toBe("deleted");
    // Emails switched on again later.
    await h.reconciler.runOnce();
    expect(warningsFor(h, sectorId)).toEqual([]);
  });
});

describe("delivering emails", () => {
  it("gives up at once on a refusal that will not change, and tells the owner", async () => {
    const h = await createHostingHarness();
    const sectorId = await h.order();
    await h.service.handlePaymentEvent({ eventId: "evt-paid", kind: "paid", sectorId });
    const reconciler = createHostingReconciler({
      store: h.store, payment: h.payment, servers: h.servers, config: h.config, now: () => h.clock.now,
      alert: (kind, details) => { h.alerts.push({ kind, details }); },
      mailer: createHostingMailer({
        store: h.store, outbox: h.outbox, appUrl: "https://play.example.test", now: () => h.clock.now,
        alert: (kind, details) => { h.alerts.push({ kind, details }); }, terms: termsAttachment(TERMS_HTML),
        transport: { send: async () => { throw new PermanentEmailError("resend returned 422: invalid to"); } }
      }),
      onEmailPass: (result) => { if ("error" in result) throw new Error(result.error); }
    });
    await reconciler.runOnce();
    expect(h.outbox.get(`order:${sectorId}`)).toMatchObject({ attempts: 0, lastError: "resend returned 422: invalid to" });
    expect(h.outbox.get(`order:${sectorId}`)?.abandonedAt).toBeDefined();
    expect(h.alerts.find((alert) => alert.kind === "email_failed")?.details).toMatchObject({ emailKey: `order:${sectorId}` });
  });

  it("retries with the address of the first attempt, so the provider sees the same request", async () => {
    const h = await createHostingHarness();
    h.mail.failing = true;
    const sectorId = await h.order();
    await h.service.handlePaymentEvent({ eventId: "evt-paid", kind: "paid", sectorId });
    await h.reconciler.runOnce();
    // The buyer changes address before the retry.
    h.outbox.rememberAddress("host", "new@example.test", h.clock.now);
    h.mail.failing = false;
    h.clock.now += HOUR;
    await h.reconciler.runOnce();
    expect(h.mail.sent.find((message) => message.idempotencyKey === `order:${sectorId}`)?.to).toBe("host@example.test");
  });

  it("deletes the address of an account that has been in no running sector for 30 days", async () => {
    const h = await createHostingHarness();
    const sectorId = await h.openSector();
    const invite = h.service.createInvite(account("host"), sectorId);
    if (!invite.ok) throw new Error(invite.code);
    h.service.acceptInvite(account("visitor"), invite.invite.code);
    h.store.removeMember(sectorId, "visitor");
    h.clock.now += ADDRESS_RETENTION_MS + HOUR;
    h.servers.lastHumanVisitAt.set(`${sectorId}.sectors.invalid`, h.clock.now);
    await h.reconciler.runOnce();
    expect(h.outbox.getAddress("visitor")).toBeUndefined();
    // The host's sector is still running.
    expect(h.outbox.getAddress("host")).toBe("host@example.test");
  });
});
