import { afterEach, describe, expect, it } from "vitest";

import { account, createHostingHarness } from "./hosting-test-support.js";
import { createSectorControlApp, randomId } from "./sector-control-app.js";

describe("hosting service app", () => {
  const closers: Array<() => Promise<void>> = [];
  afterEach(async () => { while (closers.length > 0) await closers.pop()?.(); });

  const start = async () => {
    const h = await createHostingHarness();
    const control = createSectorControlApp({
      store: h.store, payment: h.payment, servers: h.servers, config: h.config, ticketPrivateKeyPem: h.ticketPrivateKeyPem,
      reconcileIntervalMs: 60_000, now: () => h.clock.now, alert: (kind, details) => { h.alerts.push({ kind, details }); },
      verifyIdToken: async (token) => (token === "token-host" ? account("host") : undefined),
      parsePaymentWebhook: async (rawBody) => JSON.parse(rawBody) as { eventId: string; kind: "paid"; sectorId: string }
    });
    closers.push(control.close);
    return { h, control };
  };

  it("serves an order from purchase to an open sector, and reports its state", async () => {
    const { h, control } = await start();
    const ordered = await control.app.inject({ method: "POST", url: "/hosting/orders", headers: { authorization: "Bearer token-host" }, payload: { mapStyle: "continents", mapSize: "small" } });
    const sectorId = (ordered.json() as { sector: { sectorId: string } }).sector.sectorId;
    expect(sectorId).toMatch(/^s-[a-z0-9]{10}$/);

    await control.app.inject({ method: "POST", url: "/hosting/payment-webhook", headers: { "content-type": "application/json" }, payload: JSON.stringify({ eventId: "evt-1", kind: "paid", sectorId }) });
    await control.runReconcilerOnce();
    h.servers.healthy.add(`${sectorId}.sectors.invalid`);
    await control.runReconcilerOnce();

    expect((await control.app.inject({ method: "GET", url: "/hosting/health" })).json()).toMatchObject({ ok: true, salesEnabled: true, sectors: { open: 1 } });
    const ticket = await control.app.inject({ method: "POST", url: `/hosting/sectors/${sectorId}/ticket`, headers: { authorization: "Bearer token-host" } });
    expect(ticket.json()).toMatchObject({ ok: true, wsUrl: `wss://${sectorId}.sectors.invalid/ws` });
  });

  it("lets the game client call it from another origin", async () => {
    const { control } = await start();
    const preflight = await control.app.inject({ method: "OPTIONS", url: "/hosting/sectors", headers: { origin: "https://play.borderempires.com", "access-control-request-method": "GET", "access-control-request-headers": "authorization" } });
    expect(preflight.statusCode).toBe(204);
    expect(preflight.headers["access-control-allow-headers"]).toContain("Authorization");
    const listed = await control.app.inject({ method: "GET", url: "/hosting/sectors", headers: { authorization: "Bearer token-host", origin: "https://play.borderempires.com" } });
    expect(listed.headers["access-control-allow-origin"]).toBe("*");
  });

  it("survives a provider that throws during a reconciler pass", async () => {
    const { h, control } = await start();
    await h.openSector();
    h.servers.getContestStatus = async () => { throw new Error("provider down"); };
    await expect(control.runReconcilerOnce()).resolves.toBeUndefined();
  });

  it("makes ids from lowercase letters and digits only", () => {
    expect(randomId(40)).toMatch(/^[a-z0-9]{40}$/);
    expect(randomId(12)).not.toBe(randomId(12));
  });
});
