// Player emails (plan section 15, step 8c; Terms of Sale sections 3, 5 and 7):
// the order confirmation with the Terms and the request made at checkout, the
// ready email, the warning before an idle sector closes, and the withdrawal
// acknowledgement. Each goes out once, to the address the account bought or
// joined with, and survives a provider outage.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { HOSTED_SECTOR_CONSENT_EARLY_START, HOSTED_SECTOR_CONSENT_TERMS, HOSTED_SECTOR_TERMS_VERSION } from "@border-empires/shared";
import { describe, expect, it } from "vitest";

import { account, CONSENT, createHostingHarness, DAY, HOUR, MINUTE, TERMS_HTML } from "../hosting-test-support.js";
import { openBar, pledge } from "../hosting-service/funding-test-support.js";
import { MAX_SEND_ATTEMPTS, termsAttachment } from "./hosting-mailer.js";

const subjects = (h: Awaited<ReturnType<typeof createHostingHarness>>, to?: string): string[] =>
  h.mail.sent.filter((message) => to === undefined || message.to === to).map((message) => message.subject);

describe("hosted sector emails", () => {
  it("confirms an order once, to the buyer, with the Terms of Sale and the request made at checkout", async () => {
    const h = await createHostingHarness();
    const sectorId = await h.order();
    await h.reconciler.runOnce();
    // Nothing is confirmed before payment.
    expect(h.mail.sent).toEqual([]);

    await h.service.handlePaymentEvent({ eventId: "evt-paid", kind: "paid", sectorId });
    await h.reconciler.runOnce();
    expect(h.mail.passErrors).toEqual([]);
    const confirmation = h.mail.sent.find((message) => message.subject === "Your hosted sector order is confirmed");
    expect(confirmation).toMatchObject({ to: "host@example.test", idempotencyKey: `order:${sectorId}` });
    expect(confirmation?.attachments).toEqual([{ filename: `border-empires-terms-of-sale-${HOSTED_SECTOR_TERMS_VERSION}.html`, content: TERMS_HTML, contentType: "text/html" }]);
    expect(confirmation?.text).toContain(`"${HOSTED_SECTOR_CONSENT_TERMS}"`);
    expect(confirmation?.text).toContain(`"${HOSTED_SECTOR_CONSENT_EARLY_START}"`);
    expect(confirmation?.text).toContain("USD 20.00");
    expect(confirmation?.text).toContain(`version ${HOSTED_SECTOR_TERMS_VERSION}`);

    // Later passes, and the same payment reported again, add nothing.
    await h.service.handlePaymentEvent({ eventId: "evt-paid-again", kind: "paid", sectorId });
    await h.reconciler.runOnce();
    await h.reconciler.runOnce();
    expect(subjects(h).filter((subject) => subject === "Your hosted sector order is confirmed")).toHaveLength(1);
  });

  it("tells the host when the sector is ready", async () => {
    const h = await createHostingHarness();
    await h.openSector();
    await h.reconciler.runOnce();
    expect(subjects(h, "host@example.test")).toEqual(["Your hosted sector order is confirmed", "Your hosted sector is ready"]);
  });

  it("confirms each share of a funding bar to whoever paid it, while the card is only held", async () => {
    const h = await createHostingHarness();
    const sectorId = openBar(h, ["friend"]);
    await pledge(h, "friend", sectorId, 500);
    await h.reconciler.runOnce();
    const share = h.mail.sent.find((message) => message.to === "friend@example.test");
    expect(share).toMatchObject({ subject: "Your share of a hosted sector is confirmed" });
    expect(share?.text).toContain("USD 5.00");
    expect(share?.text).toContain("Your card is held, not charged.");
    expect(share?.attachments?.[0]?.content).toBe(TERMS_HTML);
    // No order confirmation for the sector itself: it has no single buyer.
    expect(subjects(h)).not.toContain("Your hosted sector order is confirmed");
  });

  it("confirms the charge of a share at the amount charged, and tells whoever's hold was let go", async () => {
    const h = await createHostingHarness();
    const sectorId = openBar(h, ["friend", "late"]);
    const friend = (await pledge(h, "friend", sectorId, 1500)).replace("fake-hold-", "");
    await h.reconciler.runOnce();
    expect(subjects(h, "friend@example.test")).toEqual(["Your share of a hosted sector is confirmed"]);

    // The bar fills; the share that crosses the price is charged only the part still needed (Terms section 6a).
    h.store.transitionContribution(friend, ["held"], { state: "captured", amountCents: 1200 }, h.clock.now);
    await h.reconciler.runOnce();
    const charged = h.mail.sent.find((message) => message.subject === "Your share of a hosted sector has been charged");
    expect(charged?.to).toBe("friend@example.test");
    expect(charged?.text).toContain("USD 12.00 was charged");
    expect(charged?.attachments?.[0]?.content).toBe(TERMS_HTML);

    const late = (await pledge(h, "late", sectorId, 500)).replace("fake-hold-", "");
    await h.reconciler.runOnce();
    h.store.transitionContribution(late, ["held"], { state: "released" }, h.clock.now);
    await h.reconciler.runOnce();
    expect(subjects(h, "late@example.test")).toEqual(["Your share of a hosted sector is confirmed", "Your hold for a hosted sector has been released"]);
  });

  it("acknowledges a withdrawal with the amounts", async () => {
    const h = await createHostingHarness();
    const sectorId = await h.openSector();
    h.clock.now += 2 * DAY + HOUR;
    const quoted = h.service.quoteWithdrawal(account("host"), sectorId);
    if (!quoted.ok) throw new Error(quoted.code);
    await h.service.withdraw(account("host"), sectorId, quoted.quote.purchaseKey);
    await h.reconciler.runOnce();
    const ack = h.mail.sent.find((message) => message.subject === "Your withdrawal is confirmed");
    expect(ack?.to).toBe("host@example.test");
    expect(ack?.text).toContain("You paid USD 20.00. For the days the sector was open, USD 2.00 is kept. USD 18.00 is being refunded");
  });

  it("warns every member 2 days before an idle sector closes, and never closes it sooner than 2 days after the warning", async () => {
    const h = await createHostingHarness();
    const sectorId = await h.openSector();
    const invite = h.service.createInvite(account("host"), sectorId);
    if (!invite.ok) throw new Error(invite.code);
    h.service.acceptInvite(account("friend"), invite.invite.code);

    // The service was down when the warning was due: it goes out now, and the closing waits for it.
    h.clock.now += 7 * DAY;
    await h.reconciler.runOnce();
    expect(h.store.getSector(sectorId)?.state).toBe("open");
    const warnings = h.mail.sent.filter((message) => message.subject.startsWith(`Sector ${sectorId} closes on`));
    expect(warnings.map((message) => message.to).sort()).toEqual(["friend@example.test", "host@example.test"]);

    h.clock.now += 2 * DAY - MINUTE;
    await h.reconciler.runOnce();
    expect(h.store.getSector(sectorId)?.state).toBe("open");
    h.clock.now += MINUTE;
    await h.reconciler.runOnce();
    expect(h.store.getSector(sectorId)?.state).toBe("deleted");
    // Each member was warned once.
    expect(h.mail.sent.filter((message) => message.subject.startsWith(`Sector ${sectorId} closes on`))).toHaveLength(2);
  });

  it("warns again after a visit starts a new idle stretch", async () => {
    const h = await createHostingHarness();
    const sectorId = await h.openSector();
    h.clock.now += 5 * DAY;
    await h.reconciler.runOnce();
    h.servers.lastHumanVisitAt.set(`${sectorId}.sectors.invalid`, h.clock.now);
    h.clock.now += 5 * DAY;
    await h.reconciler.runOnce();
    expect(h.mail.sent.filter((message) => message.subject.startsWith(`Sector ${sectorId} closes on`))).toHaveLength(2);
    expect(h.store.getSector(sectorId)?.state).toBe("open");
  });

  it("keeps emails while the provider fails, retries with growing waits, and tells the owner when it gives up", async () => {
    const h = await createHostingHarness();
    h.mail.failing = true;
    const sectorId = await h.order();
    await h.service.handlePaymentEvent({ eventId: "evt-paid", kind: "paid", sectorId });
    await h.reconciler.runOnce();
    expect(h.outbox.get(`order:${sectorId}`)).toMatchObject({ attempts: 1, lastError: "provider down" });
    // Not due again straight away.
    await h.reconciler.runOnce();
    expect(h.outbox.get(`order:${sectorId}`)?.attempts).toBe(1);

    h.mail.failing = false;
    h.clock.now += 10 * MINUTE;
    await h.reconciler.runOnce();
    expect(h.outbox.get(`order:${sectorId}`)?.sentAt).toBe(h.clock.now);
    expect(subjects(h)).toContain("Your hosted sector order is confirmed");

    // An email the provider never accepts is given up after MAX_SEND_ATTEMPTS, and the owner told.
    h.mail.failing = true;
    await h.reconciler.runOnce();
    h.servers.healthy.add(`${sectorId}.sectors.invalid`);
    await h.reconciler.runOnce();
    for (let pass = 0; pass < MAX_SEND_ATTEMPTS + 2; pass += 1) {
      h.clock.now += 6 * HOUR;
      await h.reconciler.runOnce();
    }
    expect(h.outbox.get(`ready:${sectorId}`)?.abandonedAt).toBeDefined();
    expect(h.alerts.find((alert) => alert.kind === "email_failed")?.details).toMatchObject({ emailKey: `ready:${sectorId}`, kind: "sector_ready" });
  });

  it("does not keep an unverified address, and gives up an email it has no address for", async () => {
    const h = await createHostingHarness();
    const result = await h.service.createOrder(account("host", { emailVerified: false }), { mapStyle: "continents", mapSize: "standard" }, undefined);
    expect(result.ok).toBe(false);
    expect(h.outbox.getAddress("host")).toBeUndefined();

    // A sign-in token without an address: the order goes through, its confirmation cannot.
    const { email: _ignored, ...withoutEmail } = account("buyer");
    const ordered = await h.service.createOrder(withoutEmail, { mapStyle: "continents", mapSize: "standard" }, CONSENT);
    if (!ordered.ok) throw new Error(ordered.code);
    const sectorId = ordered.sector.sectorId;
    await h.service.handlePaymentEvent({ eventId: "evt-paid", kind: "paid", sectorId });
    await h.reconciler.runOnce();
    expect(h.mail.sent).toEqual([]);
    expect(h.outbox.get(`order:${sectorId}`)?.abandonedAt).toBeDefined();
    expect(h.alerts.find((alert) => alert.kind === "email_failed")?.details).toMatchObject({ emailKey: `order:${sectorId}`, reason: "no email address for this account" });
  });

  it("never attaches other Terms than the ones the buyer agreed to, keeps trying, and tells the owner", async () => {
    const h = await createHostingHarness();
    h.outbox.rememberAddress("host", "host@example.test", h.clock.now);
    // Written before a deploy that changed the Terms, sent after it.
    h.outbox.enqueue({ emailKey: "order:older-terms", kind: "order_confirmation", accountUid: "host", subject: "s", text: "t", html: "h", attachTermsVersion: "2020-01-01" }, h.clock.now);
    await h.reconciler.runOnce();
    expect(h.mail.sent).toEqual([]);
    expect(h.outbox.get("order:older-terms")).toMatchObject({ attempts: 1 });
    expect(h.outbox.get("order:older-terms")?.abandonedAt).toBeUndefined();
    expect(h.alerts.find((alert) => alert.kind === "email_failed")?.details).toMatchObject({ emailKey: "order:older-terms", retrying: 1 });
    for (let pass = 0; pass < MAX_SEND_ATTEMPTS + 2; pass += 1) {
      h.clock.now += 6 * HOUR;
      await h.reconciler.runOnce();
    }
    expect(h.mail.sent).toEqual([]);
    expect(h.outbox.get("order:older-terms")?.abandonedAt).toBeDefined();
  });

  it("attaches only a Terms page that names this build's version", () => {
    expect(() => termsAttachment("<html>no version</html>")).toThrow(/version \(none\)/);
    expect(() => termsAttachment('<meta name="terms-version" content="2020-01-01" />')).toThrow(/version 2020-01-01/);
    // The draft in this repository matches the version the order form records.
    const draft = readFileSync(fileURLToPath(new URL("../../../../docs/legal-drafts/purchase-terms.html", import.meta.url)), "utf8");
    expect(termsAttachment(draft).version).toBe(HOSTED_SECTOR_TERMS_VERSION);
  });
});
