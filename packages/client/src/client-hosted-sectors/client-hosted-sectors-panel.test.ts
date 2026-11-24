// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import type { HostedSectorSummary, HostedSectorTicket, HostingApiResult } from "./client-hosted-sectors-api.js";
import { setActiveHostedSectorSession } from "./client-hosted-sector-session.js";
import { createHostedSectorsPanel, hostedSectorRowHtml, type HostedSectorsPanelDeps } from "./client-hosted-sectors-panel.js";

vi.mock("./client-hosted-sectors.css", () => ({}));

const sector = (overrides: Partial<HostedSectorSummary> = {}): HostedSectorSummary => ({
  sectorId: "s-abc", state: "open", role: "member", options: { mapStyle: "continents", mapSize: "standard" }, members: 3, humanPlaces: 40, delayed: false, ...overrides
});

const memoryStorage = () => {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
};

const makeDeps = (overrides: Partial<HostedSectorsPanelDeps> = {}) => {
  const storage = memoryStorage();
  const api = {
    listSectors: vi.fn(async (): Promise<HostingApiResult<{ sectors: HostedSectorSummary[] }>> => ({ ok: true, sectors: [sector()] })),
    issueTicket: vi.fn(async (_sectorId: string): Promise<HostingApiResult<HostedSectorTicket>> => ({ ok: true, ticket: "t-1", expiresAt: 99, wsUrl: "wss://s-abc.sectors.borderempires.com/ws" })),
    acceptInvite: vi.fn(async (_code: string): Promise<HostingApiResult<{ sector: HostedSectorSummary }>> => ({ ok: true, sector: sector() }))
  };
  const navigate = vi.fn();
  const deps: HostedSectorsPanelDeps = { api, isSignedIn: () => true, navigate, storage, pageIsLocal: false, ...overrides };
  return { deps, api, navigate, storage };
};

const flush = async (): Promise<void> => { await new Promise((resolve) => setTimeout(resolve, 0)); };

afterEach(() => {
  document.body.innerHTML = "";
  setActiveHostedSectorSession(undefined);
});

describe("hosted sector row", () => {
  it("offers Enter for an open or ended sector, and nothing for one that is not ready", () => {
    expect(hostedSectorRowHtml(sector(), undefined)).toContain('data-hosted-sector-enter="s-abc"');
    expect(hostedSectorRowHtml(sector({ state: "ended" }), undefined)).toContain("data-hosted-sector-enter");
    const creating = hostedSectorRowHtml(sector({ state: "creating", delayed: true }), undefined);
    expect(creating).not.toContain("data-hosted-sector-enter");
    expect(creating).toContain("Taking longer than expected");
    expect(hostedSectorRowHtml(sector({ state: "deleted" }), undefined)).toContain("Closed");
  });

  it("marks the sector the player is in, and says so when a map size cannot be played in this build", () => {
    expect(hostedSectorRowHtml(sector(), "s-abc")).toContain("You are here");
    const small = hostedSectorRowHtml(sector({ options: { mapStyle: "islands", mapSize: "small" } }), undefined);
    expect(small).not.toContain("data-hosted-sector-enter");
    expect(small).toContain("can't be played here yet");
    expect(hostedSectorRowHtml(sector({ role: "host" }), undefined)).toContain("You host this sector");
  });
});

describe("my sectors panel", () => {
  it("lists the public sector and the account's hosted sectors", async () => {
    const h = makeDeps();
    await createHostedSectorsPanel(h.deps).openList();
    const rows = Array.from(document.querySelectorAll(".hosted-sector-row")).map((row) => row.textContent ?? "");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain("The public sector");
    expect(rows[0]).toContain("You are here");
    expect(rows[1]).toContain("3 of 40 places taken");
  });

  it("enters a sector: fetches a ticket, remembers it, and loads the page for that sector", async () => {
    const h = makeDeps();
    await createHostedSectorsPanel(h.deps).openList();
    document.querySelector<HTMLButtonElement>("[data-hosted-sector-enter]")?.click();
    await flush();
    expect(h.api.issueTicket).toHaveBeenCalledWith("s-abc");
    expect(JSON.parse(h.storage.values.get("be-hosted-sector") ?? "{}")).toEqual({ sectorId: "s-abc", wsUrl: "wss://s-abc.sectors.borderempires.com/ws", ticket: "t-1", expiresAt: 99 });
    expect(h.navigate).toHaveBeenCalledWith("/?sector=s-abc");
  });

  it("refuses to open a sector whose address is not under the hosted-sector domain", async () => {
    const h = makeDeps();
    h.api.issueTicket.mockResolvedValueOnce({ ok: true, ticket: "t", expiresAt: 1, wsUrl: "wss://evil.example.com/ws" });
    await createHostedSectorsPanel(h.deps).openList();
    document.querySelector<HTMLButtonElement>("[data-hosted-sector-enter]")?.click();
    await flush();
    expect(h.navigate).not.toHaveBeenCalled();
    expect(h.storage.values.size).toBe(0);
    expect(document.querySelector("[data-hosted-sectors-error]")?.textContent).toContain("not recognised");
  });

  it("shows the service's reason when a sector cannot be entered", async () => {
    const h = makeDeps();
    h.api.issueTicket.mockResolvedValueOnce({ ok: false, code: "SECTOR_NOT_READY", message: "This sector is not open." });
    await createHostedSectorsPanel(h.deps).openList();
    document.querySelector<HTMLButtonElement>("[data-hosted-sector-enter]")?.click();
    await flush();
    expect(document.querySelector("[data-hosted-sectors-error]")?.textContent).toBe("This sector is not open.");
    expect(h.navigate).not.toHaveBeenCalled();
  });

  it("offers the way back to the public sector from inside a hosted one", async () => {
    setActiveHostedSectorSession({ sectorId: "s-abc", wsUrl: "wss://s-abc.sectors.borderempires.com/ws", ticket: "t", expiresAt: 1 });
    const h = makeDeps();
    h.storage.setItem("be-hosted-sector", "{}");
    await createHostedSectorsPanel(h.deps).openList();
    expect(document.querySelector("[data-hosted-sector-enter]")).toBeNull();
    document.querySelector<HTMLButtonElement>("[data-hosted-sector-leave]")?.click();
    expect(h.storage.values.size).toBe(0);
    expect(h.navigate).toHaveBeenCalledWith("/");
  });

  it("joins from an invite link and then shows the list", async () => {
    const h = makeDeps();
    await createHostedSectorsPanel(h.deps).openInvite("code1");
    expect(h.api.acceptInvite).toHaveBeenCalledWith("code1");
    expect(document.querySelector(".hosted-sector-notice")?.textContent).toContain("You have joined");
    expect(document.querySelectorAll(".hosted-sector-row")).toHaveLength(2);
  });

  it("asks a signed-out visitor to sign in before joining, and reports a dead link", async () => {
    const signedOut = makeDeps({ isSignedIn: () => false });
    await createHostedSectorsPanel(signedOut.deps).openInvite("code1");
    expect(signedOut.api.acceptInvite).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Sign in");
    document.body.innerHTML = "";

    const h = makeDeps();
    h.api.acceptInvite.mockResolvedValueOnce({ ok: false, code: "INVITE_INVALID", message: "This invite link is no longer valid." });
    await createHostedSectorsPanel(h.deps).openInvite("code1");
    expect(document.body.textContent).toContain("no longer valid");
  });

  it("escapes text that came from the service", async () => {
    const h = makeDeps();
    h.api.listSectors.mockResolvedValueOnce({ ok: false, code: "X", message: "<img src=x onerror=alert(1)>" });
    await createHostedSectorsPanel(h.deps).openList();
    expect(document.querySelector("img")).toBeNull();
  });
});
