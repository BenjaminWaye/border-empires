import { describe, expect, it, vi } from "vitest";

import { CHECKOUT_CONSENT } from "./client-hosted-sector-order.js";
import { createHostingApi } from "./client-hosted-sectors-api.js";

const SECTOR = { sectorId: "s-abc", state: "open", role: "member", options: { mapStyle: "continents", mapSize: "standard" }, members: 2, humanPlaces: 40, delayed: false, createdAt: 1 };

const reply = (status: number, body: unknown): Response => ({ status, json: async () => body }) as unknown as Response;

const makeApi = (fetchImpl: typeof fetch, signedIn = true) =>
  createHostingApi({ wsUrl: "wss://api.borderempires.com/ws", getIdToken: async () => (signedIn ? "id-token" : undefined), fetchImpl });

describe("hosting API client", () => {
  it("lists sectors from the main API with the sign-in token, dropping rows it does not understand", async () => {
    const fetchImpl = vi.fn(async () => reply(200, { ok: true, sectors: [SECTOR, { sectorId: "s-bad", state: "exploded" }] }));
    const listed = await makeApi(fetchImpl as unknown as typeof fetch).listSectors();
    expect(fetchImpl).toHaveBeenCalledWith("https://api.borderempires.com/hosting/sectors", { method: "GET", headers: { authorization: "Bearer id-token" } });
    expect(listed).toEqual({ ok: true, sectors: [{ sectorId: "s-abc", state: "open", role: "member", options: { mapStyle: "continents", mapSize: "standard" }, members: 2, humanPlaces: 40, delayed: false }] });
  });

  it("asks for nothing when signed out", async () => {
    const fetchImpl = vi.fn();
    expect(await makeApi(fetchImpl as unknown as typeof fetch, false).listSectors()).toMatchObject({ ok: false, code: "UNAUTHORIZED" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns the ticket and server address for a sector", async () => {
    const fetchImpl = vi.fn(async (_url: string) => reply(200, { ok: true, ticket: "t", expiresAt: 5, wsUrl: "wss://s-abc.borderempires-sectors.com/ws" }));
    expect(await makeApi(fetchImpl as unknown as typeof fetch).issueTicket("s-abc")).toEqual({ ok: true, ticket: "t", expiresAt: 5, wsUrl: "wss://s-abc.borderempires-sectors.com/ws" });
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://api.borderempires.com/hosting/sectors/s-abc/ticket");
  });

  it("passes on the service's own reason when it refuses", async () => {
    const fetchImpl = vi.fn(async () => reply(409, { ok: false, code: "SECTOR_FULL", message: "This sector has no places left." }));
    expect(await makeApi(fetchImpl as unknown as typeof fetch).acceptInvite("code1")).toEqual({ ok: false, code: "SECTOR_FULL", message: "This sector has no places left." });
  });

  it("reports an unreachable service, and a reply that is not what was asked for", async () => {
    const down = vi.fn(async () => { throw new Error("offline"); });
    expect(await makeApi(down as unknown as typeof fetch).listSectors()).toMatchObject({ ok: false, code: "UNAVAILABLE" });
    // Today the gateway answers 404 for /hosting/*: the hosting service is not deployed yet.
    const notFound = vi.fn(async () => reply(404, { message: "Route not found" }));
    expect(await makeApi(notFound as unknown as typeof fetch).issueTicket("s-abc")).toMatchObject({ ok: false, code: "UNAVAILABLE" });
    expect(await makeApi(notFound as unknown as typeof fetch).acceptInvite("code1")).toMatchObject({ ok: false });
  });

  it("starts an order with the chosen options and returns the payment page, and makes an invite link", async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => reply(200, { ok: true, sector: { ...SECTOR, state: "awaiting_payment", role: "host", checkoutUrl: "https://checkout.stripe.com/c/pay/abc" } }));
    const ordered = await makeApi(fetchImpl as unknown as typeof fetch).createOrder({ mapStyle: "continents", mapSize: "standard" }, CHECKOUT_CONSENT);
    expect(ordered).toMatchObject({ ok: true, sector: { state: "awaiting_payment", checkoutUrl: "https://checkout.stripe.com/c/pay/abc" } });
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://api.borderempires.com/hosting/orders");
    expect(fetchImpl.mock.calls[0]?.[1]).toEqual({ method: "POST", headers: { authorization: "Bearer id-token", "content-type": "application/json" }, body: JSON.stringify({ mapStyle: "continents", mapSize: "standard", consent: CHECKOUT_CONSENT }) });

    const invite = vi.fn(async () => reply(200, { ok: true, invite: { code: "abc123" } }));
    expect(await makeApi(invite as unknown as typeof fetch).createInvite("s-abc")).toEqual({ ok: true, code: "abc123" });
    const closed = vi.fn(async () => reply(503, { ok: false, code: "SALES_CLOSED", message: "Hosting is not on sale right now." }));
    expect(await makeApi(closed as unknown as typeof fetch).createOrder({ mapStyle: "continents", mapSize: "standard" }, CHECKOUT_CONSENT)).toEqual({ ok: false, code: "SALES_CLOSED", message: "Hosting is not on sale right now." });
  });

  it("reads a funding bar, opens one, and pledges a share", async () => {
    const funding = { targetCents: 2000, pledgedCents: 500, pendingCents: 0, deadline: 1, minimumCents: 500, yourCents: 500, yourCheckoutUrl: "https://checkout.stripe.com/c/pay/x" };
    const sector = { sectorId: "s-abc", state: "funding", role: "host", options: { mapStyle: "continents", mapSize: "standard" }, members: 1, humanPlaces: 40, delayed: false, funding };
    const calls: Array<{ url: string; body?: string }> = [];
    const fetchImpl = async (url: string, init?: { body?: string }) => {
      calls.push({ url, ...(init?.body ? { body: init.body } : {}) });
      const body = url.endsWith("/contributions") ? { ok: true, checkoutUrl: "https://checkout.stripe.com/c/pay/y" } : url.endsWith("/sectors") ? { ok: true, sectors: [sector] } : { ok: true, sector };
      return { status: 200, json: async () => body };
    };
    const api = makeApi(fetchImpl as unknown as typeof fetch);
    expect(await api.listSectors()).toMatchObject({ ok: true, sectors: [{ state: "funding", funding }] });
    expect(await api.openFundingBar({ mapStyle: "continents", mapSize: "standard" })).toMatchObject({ ok: true, sector: { state: "funding" } });
    expect(await api.contribute("s-abc", 700, CHECKOUT_CONSENT)).toEqual({ ok: true, checkoutUrl: "https://checkout.stripe.com/c/pay/y" });
    expect(calls.map((call) => call.url.replace(/^https?:\/\/[^/]+/, ""))).toEqual(["/hosting/sectors", "/hosting/funding-bars", "/hosting/sectors/s-abc/contributions"]);
    expect(calls[2]?.body).toBe(JSON.stringify({ amountCents: 700, consent: CHECKOUT_CONSENT }));
  });
});
