import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import type { HostingPaymentEvent } from "../hosting-service/hosting-service.js";
import { account, CONSENT, createHostingHarness } from "../hosting-test-support.js";
import { registerHostingRoutes } from "./hosting-routes.js";

describe("hosting HTTP routes", () => {
  const apps: Array<{ close: () => Promise<unknown> }> = [];
  afterEach(async () => { while (apps.length > 0) await apps.pop()?.close(); });

  const start = async () => {
    const h = await createHostingHarness();
    const app = Fastify();
    apps.push(app);
    let rejected = 0;
    registerHostingRoutes(app, {
      service: h.service,
      // Test tokens are "token-<uid>"; a real deployment verifies a Firebase ID token.
      verifyIdToken: async (token) => (token.startsWith("token-") ? account(token.slice(6), { isGuest: token === "token-guest" }) : undefined),
      parsePaymentWebhook: async (rawBody, headers) => {
        if (headers["x-test-signature"] !== `sig:${rawBody.length}`) return undefined;
        const parsed = JSON.parse(rawBody) as HostingPaymentEvent | { kind: "other" };
        return parsed.kind === "other" ? "ignored" : parsed;
      },
      onWebhookRejected: () => { rejected += 1; }
    });
    const call = (method: "GET" | "POST" | "DELETE", url: string, uid?: string, payload?: unknown) =>
      app.inject({ method, url, ...(uid ? { headers: { authorization: `Bearer token-${uid}` } } : {}), ...(payload !== undefined ? { payload: payload as object } : {}) });
    const webhook = (event: object, signature?: string) => {
      const body = JSON.stringify(event);
      return app.inject({ method: "POST", url: "/hosting/payment-webhook", payload: body, headers: { "content-type": "application/json", "x-test-signature": signature ?? `sig:${body.length}` } });
    };
    return { h, call, webhook, rejectedCount: () => rejected };
  };

  it("requires a signed-in account on every player route", async () => {
    const { call } = await start();
    for (const [method, url] of [["POST", "/hosting/orders"], ["GET", "/hosting/sectors"], ["GET", "/hosting/sectors/s-x"], ["POST", "/hosting/sectors/s-x/invites"], ["POST", "/hosting/sectors/s-x/ticket"], ["POST", "/hosting/invites/abc/accept"], ["DELETE", "/hosting/invites/abc"], ["POST", "/hosting/funding-bars"], ["POST", "/hosting/sectors/s-x/contributions"]] as const) {
      expect((await call(method, url)).statusCode, `${method} ${url}`).toBe(401);
    }
  });

  it("takes an order through payment, invitation and entry", async () => {
    const { h, call, webhook } = await start();
    expect((await call("POST", "/hosting/orders", "host", { mapStyle: "volcano", mapSize: "standard" })).statusCode).toBe(400);
    // Without both consents nothing is ordered.
    const unconsented = await call("POST", "/hosting/orders", "host", { mapStyle: "continents", mapSize: "standard" });
    expect(unconsented.statusCode).toBe(400);
    expect(unconsented.json()).toMatchObject({ ok: false, code: "CONSENT_REQUIRED" });
    const ordered = await call("POST", "/hosting/orders", "host", { mapStyle: "continents", mapSize: "standard", consent: CONSENT });
    expect(ordered.statusCode).toBe(200);
    const sectorId = (ordered.json() as { sector: { sectorId: string } }).sector.sectorId;

    expect((await webhook({ eventId: "evt-1", kind: "paid", sectorId })).statusCode).toBe(200);
    expect((await webhook({ eventId: "evt-1", kind: "paid", sectorId })).statusCode).toBe(200);
    await h.reconciler.runOnce();
    h.servers.healthy.add(`${sectorId}.sectors.invalid`);
    await h.reconciler.runOnce();

    const invite = (await call("POST", `/hosting/sectors/${sectorId}/invites`, "host")).json() as { invite: { code: string } };
    expect((await call("POST", `/hosting/invites/${invite.invite.code}/accept`, "friend")).statusCode).toBe(200);
    expect((await call("POST", `/hosting/invites/${invite.invite.code}/accept`, "guest")).statusCode).toBe(403);
    expect((await call("GET", "/hosting/sectors", "friend")).json()).toMatchObject({ ok: true, sectors: [{ sectorId, state: "open", role: "member", members: 2 }] });

    const ticket = await call("POST", `/hosting/sectors/${sectorId}/ticket`, "friend");
    expect(ticket.json()).toMatchObject({ ok: true, wsUrl: `wss://${sectorId}.sectors.invalid/ws` });
    expect((await call("POST", `/hosting/sectors/${sectorId}/ticket`, "stranger")).statusCode).toBe(403);
    expect((await call("GET", `/hosting/sectors/${sectorId}`, "stranger")).statusCode).toBe(404);
    expect((await call("DELETE", `/hosting/invites/${invite.invite.code}`, "friend")).statusCode).toBe(403);
    expect((await call("DELETE", `/hosting/invites/${invite.invite.code}`, "host")).json()).toEqual({ ok: true, revoked: true });
  });

  it("never exposes payment or server references to players", async () => {
    const { h, call } = await start();
    const sectorId = await h.openSector();
    const body = (await call("GET", `/hosting/sectors/${sectorId}`, "host")).body;
    expect(body).not.toContain("fake-pay-");
    expect(body).not.toContain("fake-server-");
  });

  it("rejects a webhook whose signature does not verify, and changes nothing", async () => {
    const { h, webhook, rejectedCount } = await start();
    const sectorId = await h.order();
    expect((await webhook({ eventId: "evt-1", kind: "paid", sectorId }, "sig:forged")).statusCode).toBe(400);
    expect(rejectedCount()).toBe(1);
    expect(h.store.getSector(sectorId)?.state).toBe("awaiting_payment");
    expect((await webhook({ kind: "other" })).statusCode).toBe(200);
  });

  it("opens a funding bar, takes a friend's share through the webhook, and refuses bad amounts", async () => {
    const { h, call, webhook } = await start();
    const opened = (await call("POST", "/hosting/funding-bars", "host", { mapStyle: "continents", mapSize: "standard" })).json() as { ok: boolean; sector: { sectorId: string; state: string; funding: { targetCents: number } } };
    expect(opened).toMatchObject({ ok: true, sector: { state: "funding", funding: { targetCents: 2000 } } });
    const sectorId = opened.sector.sectorId;
    const invite = (await call("POST", `/hosting/sectors/${sectorId}/invites`, "host")).json() as { invite: { code: string } };
    await call("POST", `/hosting/invites/${invite.invite.code}/accept`, "friend");
    expect((await call("POST", `/hosting/sectors/${sectorId}/contributions`, "friend", { amountCents: "5" })).statusCode).toBe(400);
    expect((await call("POST", `/hosting/sectors/${sectorId}/contributions`, "friend", { amountCents: 100, consent: CONSENT })).statusCode).toBe(400);
    const pledged = (await call("POST", `/hosting/sectors/${sectorId}/contributions`, "friend", { amountCents: 1000, consent: CONSENT })).json() as { ok: boolean; checkoutUrl: string };
    expect(pledged.ok).toBe(true);
    const contributionId = pledged.checkoutUrl.replace("https://checkout.invalid/fake-hold-", "");
    expect((await webhook({ eventId: "evt-1", kind: "held", contributionId })).statusCode).toBe(200);
    expect(h.store.getContribution(contributionId)?.state).toBe("held");
    const viewed = (await call("GET", `/hosting/sectors/${sectorId}`, "friend")).json() as { sector: { funding: { pledgedCents: number; yourCents: number } } };
    expect(viewed.sector.funding).toMatchObject({ pledgedCents: 1000, yourCents: 1000 });
  });
});
