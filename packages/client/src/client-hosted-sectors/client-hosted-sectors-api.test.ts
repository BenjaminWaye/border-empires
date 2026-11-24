import { describe, expect, it, vi } from "vitest";

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
    const fetchImpl = vi.fn(async (_url: string) => reply(200, { ok: true, ticket: "t", expiresAt: 5, wsUrl: "wss://s-abc.sectors.borderempires.com/ws" }));
    expect(await makeApi(fetchImpl as unknown as typeof fetch).issueTicket("s-abc")).toEqual({ ok: true, ticket: "t", expiresAt: 5, wsUrl: "wss://s-abc.sectors.borderempires.com/ws" });
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
});
