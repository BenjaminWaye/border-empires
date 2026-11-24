import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import type { PaymentEvent } from "../hosting-service/hosting-service.js";
import { account, createHostingHarness } from "../hosting-test-support.js";
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
        const parsed = JSON.parse(rawBody) as PaymentEvent | { kind: "other" };
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
    for (const [method, url] of [["POST", "/hosting/orders"], ["GET", "/hosting/sectors"], ["GET", "/hosting/sectors/s-x"], ["POST", "/hosting/sectors/s-x/invites"], ["POST", "/hosting/sectors/s-x/ticket"], ["POST", "/hosting/invites/abc/accept"], ["DELETE", "/hosting/invites/abc"]] as const) {
      expect((await call(method, url)).statusCode, `${method} ${url}`).toBe(401);
    }
  });

  it("takes an order through payment, invitation and entry", async () => {
    const { h, call, webhook } = await start();
    expect((await call("POST", "/hosting/orders", "host", { mapStyle: "volcano", mapSize: "standard" })).statusCode).toBe(400);
    const ordered = await call("POST", "/hosting/orders", "host", { mapStyle: "continents", mapSize: "standard" });
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
});
