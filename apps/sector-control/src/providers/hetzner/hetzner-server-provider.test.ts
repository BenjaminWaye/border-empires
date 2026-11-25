import { describe, expect, it } from "vitest";

import { createHetznerApi, type HetznerFetch } from "./hetzner-api.js";
import { createHetznerServerProvider, type SectorHttpFetch } from "./hetzner-server-provider.js";
import { sectorAdminToken } from "./sector-admin-token.js";

const SHA = "a".repeat(40);
const CONFIG = {
  dnsZone: "sectors.borderempires.com", serverType: "cx23", location: "nbg1", image: "ubuntu-24.04", firewallId: 7,
  githubRepo: "BenjaminWaye/border-empires", sectorAdminSecret: "secret", ticketPublicKey: "MCowBQYDK2VwAyEA", releaseSha: async () => SHA
};
const OPTIONS = { mapStyle: "continents", mapSize: "standard" } as const;

type Call = { method: string; path: string; body: Record<string, unknown> | undefined };

/** A minimal Hetzner Cloud: servers by name and label, DNS records by name. */
const fakeHetzner = () => {
  const servers = new Map<number, { id: number; name: string; labels: Record<string, string>; public_net: { ipv4: { ip: string } } }>();
  const records = new Map<string, string>();
  const calls: Call[] = [];
  let nextId = 100;
  const json = (status: number, body: unknown) => ({ status, json: async () => body });
  const fetchImpl: HetznerFetch = async (url, init) => {
    const path = url.replace("https://api.hetzner.cloud/v1", "");
    const body = init.body ? (JSON.parse(init.body) as Record<string, unknown>) : undefined;
    calls.push({ method: init.method, path, body });
    const selector = /label_selector=be-sector%3D%3D([a-z0-9-]+)/.exec(path)?.[1];
    if (init.method === "GET" && selector) return json(200, { servers: [...servers.values()].filter((s) => s.labels["be-sector"] === selector) });
    if (init.method === "POST" && path === "/servers") {
      if ([...servers.values()].some((s) => s.name === body?.name)) return json(409, { error: { code: "uniqueness_error", message: "name is already used" } });
      const id = (nextId += 1);
      const server = { id, name: String(body?.name), labels: body?.labels as Record<string, string>, public_net: { ipv4: { ip: `203.0.113.${id - 100}` } } };
      servers.set(id, server);
      return json(201, { server });
    }
    const serverId = Number(/^\/servers\/(\d+)$/.exec(path)?.[1]);
    if (init.method === "GET" && serverId) return servers.has(serverId) ? json(200, { server: servers.get(serverId) }) : json(404, { error: { code: "not_found" } });
    if (init.method === "DELETE" && serverId) return servers.delete(serverId) ? json(200, {}) : json(404, { error: { code: "not_found" } });
    if (init.method === "POST" && path === "/zones/sectors.borderempires.com/rrsets") {
      if (records.has(String(body?.name))) return json(409, { error: { code: "uniqueness_error" } });
      records.set(String(body?.name), String((body?.records as Array<{ value: string }>)[0]?.value));
      return json(201, {});
    }
    const setRecords = /^\/zones\/sectors\.borderempires\.com\/rrsets\/([a-z0-9-]+)\/A\/actions\/set_records$/.exec(path)?.[1];
    if (init.method === "POST" && setRecords) { records.set(setRecords, String((body?.records as Array<{ value: string }>)[0]?.value)); return json(201, {}); }
    const deleteRecord = /^\/zones\/sectors\.borderempires\.com\/rrsets\/([a-z0-9-]+)\/A$/.exec(path)?.[1];
    if (init.method === "DELETE" && deleteRecord) return records.delete(deleteRecord) ? json(204, {}) : json(404, { error: { code: "not_found" } });
    return json(500, { error: { message: `unexpected ${init.method} ${path}` } });
  };
  return { servers, records, calls, api: createHetznerApi({ token: "token", fetchImpl }) };
};

describe("Hetzner server provider", () => {
  it("creates one labelled server with the sector's cloud-init and points its DNS name at it", async () => {
    const hetzner = fakeHetzner();
    const provider = createHetznerServerProvider(hetzner.api, CONFIG);
    expect(await provider.createServer({ sectorId: "s-abc", options: OPTIONS })).toEqual({ serverRef: "101", hostname: "s-abc.sectors.borderempires.com" });
    const create = hetzner.calls.find((call) => call.method === "POST" && call.path === "/servers");
    expect(create?.body).toMatchObject({
      name: "s-abc", server_type: "cx23", location: "nbg1", image: "ubuntu-24.04",
      labels: { "be-sector": "s-abc", "be-hosted": "1" }, firewalls: [{ firewall: 7 }], public_net: { enable_ipv4: true, enable_ipv6: true }
    });
    expect(String(create?.body?.user_data)).toContain(`deploy ${SHA}`);
    expect(String(create?.body?.user_data)).toContain(`ADMIN_API_TOKEN=${sectorAdminToken("secret", "s-abc")}`);
    expect(hetzner.records.get("s-abc")).toBe("203.0.113.1");
  });

  it("never makes a second server for a sector, even after a restart mid-creation", async () => {
    const hetzner = fakeHetzner();
    const provider = createHetznerServerProvider(hetzner.api, CONFIG);
    await provider.createServer({ sectorId: "s-abc", options: OPTIONS });
    hetzner.records.clear(); // the record had not been made yet when the service stopped
    expect(await provider.createServer({ sectorId: "s-abc", options: OPTIONS })).toEqual({ serverRef: "101", hostname: "s-abc.sectors.borderempires.com" });
    expect(hetzner.servers.size).toBe(1);
    expect(hetzner.records.get("s-abc")).toBe("203.0.113.1");
    // An existing record is set, not added twice.
    await provider.createServer({ sectorId: "s-abc", options: OPTIONS });
    expect(hetzner.calls.some((call) => call.path.endsWith("/actions/set_records"))).toBe(true);
  });

  it("deletes the server and its DNS record, and treats either already gone as done", async () => {
    const hetzner = fakeHetzner();
    const provider = createHetznerServerProvider(hetzner.api, CONFIG);
    const { serverRef } = await provider.createServer({ sectorId: "s-abc", options: OPTIONS });
    await provider.deleteServer(serverRef);
    expect(hetzner.servers.size).toBe(0);
    expect(hetzner.records.size).toBe(0);
    await expect(provider.deleteServer(serverRef)).resolves.toBeUndefined();
    await expect(provider.deleteServer("../servers")).rejects.toThrow(/bad server reference/);
  });

  it("refuses a sector id that is not one", async () => {
    const provider = createHetznerServerProvider(fakeHetzner().api, CONFIG);
    await expect(provider.createServer({ sectorId: "../x", options: OPTIONS })).rejects.toThrow(/bad sector id/);
  });
});

describe("Hetzner server provider: asking a sector server", () => {
  const sectorFetch = (answers: Record<string, { status: number; body: unknown }>) => {
    const seen: Array<{ url: string; authorization?: string }> = [];
    const fetchImpl: SectorHttpFetch = async (url, init) => {
      seen.push({ url, ...(init.headers?.authorization ? { authorization: init.headers.authorization } : {}) });
      const answer = answers[url];
      if (!answer) throw new Error("connection refused");
      return { status: answer.status, json: async () => answer.body };
    };
    return { seen, fetchImpl };
  };

  it("is healthy only when /health says ok", async () => {
    const host = "s-abc.sectors.borderempires.com";
    const up = createHetznerServerProvider(fakeHetzner().api, CONFIG, sectorFetch({ [`https://${host}/health`]: { status: 200, body: { ok: true } } }));
    expect(await up.isHealthy(host)).toBe(true);
    const starting = createHetznerServerProvider(fakeHetzner().api, CONFIG, sectorFetch({ [`https://${host}/health`]: { status: 503, body: { ok: false } } }));
    expect(await starting.isHealthy(host)).toBe(false);
    expect(await createHetznerServerProvider(fakeHetzner().api, CONFIG, sectorFetch({})).isHealthy(host)).toBe(false);
  });

  it("reads whether the contest ended and when a human last came, with the sector's own admin token", async () => {
    const host = "s-abc.sectors.borderempires.com";
    const http = sectorFetch({
      [`https://${host}/hq/summary`]: { status: 200, body: { status: "ended" } },
      [`https://${host}/admin/hosted/status`]: { status: 200, body: { ok: true, lastHumanVisitAt: 42 } }
    });
    const provider = createHetznerServerProvider(fakeHetzner().api, CONFIG, http);
    expect(await provider.getContestStatus(host)).toEqual({ ended: true, lastHumanVisitAt: 42 });
    expect(http.seen.find((call) => call.url.endsWith("/admin/hosted/status"))?.authorization).toBe(`Bearer ${sectorAdminToken("secret", "s-abc")}`);
    // A server that does not answer is reported as an error, which the reconciler alerts on.
    await expect(createHetznerServerProvider(fakeHetzner().api, CONFIG, sectorFetch({})).getContestStatus(host)).rejects.toThrow();
    await expect(provider.getContestStatus("evil.example.com")).rejects.toThrow(/not a sector host/);
  });
});
