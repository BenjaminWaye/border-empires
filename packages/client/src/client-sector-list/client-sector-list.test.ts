// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { anySectorOpen, buildSectorListRows, httpOriginOfWsUrl, parseSectorBoard, sectorListHtml, type SectorBoard } from "./client-sector-list.js";
import { loadSectorList, registerHostedSectorListSource, refreshSectorListIfNeeded } from "./client-sector-list-loader.js";
import { setActiveHostedSectorSession } from "../client-hosted-sectors/client-hosted-sector-session.js";
import { renderJoinSeasonOverlay } from "../client-join-season-overlay.js";

// GDD §6 and owner decision 2026-11-27: the join card lists the Sector
// Contests running now, greys out the full ones (no House place or no
// landing site left) and, when none has room, offers to fund a new sector.
const board = (overrides: Partial<SectorBoard> = {}): SectorBoard => ({ status: "active", houses: 3, maxHouses: 40, full: false, noLandingSite: false, ...overrides });

afterEach(() => {
  registerHostedSectorListSource(undefined);
  setActiveHostedSectorSession(undefined);
});

describe("sector list rows", () => {
  it("parses the gateway's Sector board", () => {
    expect(parseSectorBoard({ ok: true, status: "active", houses: 2, maxHouses: 40, full: true, noLandingSite: true, waitingCount: 0 })).toEqual(board({ houses: 2, full: true, noLandingSite: true }));
    expect(parseSectorBoard({ ok: false })).toBeUndefined();
  });

  it("greys out a sector with no landing site, says why, and offers funding when none has room", () => {
    const rows = buildSectorListRows({ publicBoard: board({ full: true, noLandingSite: true }) });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ here: true, full: true, fullReason: "Full: no landing site left", action: "none" });
    expect(anySectorOpen(rows)).toBe(false);
    const html = sectorListHtml(rows, true);
    expect(html).toContain('class="sector-list-row is-full is-here"');
    expect(html).toContain("no landing site left");
    expect(html).toContain('data-hosted-sectors-open="host"');
    expect(html).toContain("Fund a new sector");
  });

  it("does not offer funding while some sector has room, nor where funding is not offered (the apps)", () => {
    const open = buildSectorListRows({ publicBoard: board(), hostedSectors: [{ sectorId: "s1", state: "open", title: "Continents, standard map" }] });
    expect(sectorListHtml(open, true)).not.toContain("Fund a new sector");
    expect(sectorListHtml(open, true)).toContain('data-hosted-sectors-enter="s1"');
    const allFull = buildSectorListRows({ publicBoard: board({ full: true }) });
    expect(sectorListHtml(allFull, false)).not.toContain("Fund a new sector");
    expect(sectorListHtml(allFull, false)).toContain("every House place is taken");
  });

  it("on a hosted sector lists it as here and offers the public one", () => {
    const rows = buildSectorListRows({
      publicBoard: board(),
      hosted: { sectorId: "s1", title: "Islands, small map", board: board({ full: true, noLandingSite: true }) },
      hostedSectors: [{ sectorId: "s1", state: "open", title: "Islands, small map" }, { sectorId: "s2", state: "funding", title: "x" }]
    });
    expect(rows.map((row) => [row.key, row.here, row.full, row.action])).toEqual([["hosted:s1", true, true, "none"], ["public", false, false, "public"]]);
    expect(sectorListHtml(rows, true)).toContain("data-hosted-sectors-leave");
  });

  it("derives a server's HTTP origin from its WebSocket URL", () => {
    expect(httpOriginOfWsUrl("wss://s1.sectors.example.com/ws")).toBe("https://s1.sectors.example.com");
    expect(httpOriginOfWsUrl("ws://localhost:8080/ws")).toBe("http://localhost:8080");
    expect(httpOriginOfWsUrl("not a url")).toBeUndefined();
  });
});

describe("sector list loader", () => {
  const fetchFor = (byOrigin: Record<string, unknown>) =>
    vi.fn(async (input: RequestInfo | URL) => ({ json: async () => byOrigin[new URL(String(input)).origin] })) as unknown as typeof fetch;

  it("reads this hosted sector's own board and the player's hosted sectors", async () => {
    setActiveHostedSectorSession({ sectorId: "s1", wsUrl: "wss://s1.sectors.example.com/ws", ticket: "t", expiresAt: 0 });
    registerHostedSectorListSource(async () => [{ sectorId: "s1", state: "open", title: "Islands, small map" }]);
    const rows = await loadSectorList({
      wsUrl: "wss://api.example.com/ws",
      fetchImpl: fetchFor({
        "https://api.example.com": { ok: true, status: "active", houses: 1, maxHouses: 40, full: false },
        "https://s1.sectors.example.com": { ok: true, status: "active", houses: 4, maxHouses: 40, full: true, noLandingSite: true }
      })
    });
    expect(rows.find((row) => row.here)).toMatchObject({ title: "Islands, small map", full: true, fullReason: "Full: no landing site left" });
  });

  it("reloads at most once a minute, so a failed load is retried and a freed sector shows open (review regression)", async () => {
    const state = { joinSeasonId: "season-3", sectorListRows: [] as never[], sectorListLoadedFor: "" };
    let now = 0;
    const fetchImpl = vi.fn(async () => ({ json: async () => ({ ok: true, status: "active", houses: 1, maxHouses: 40, full: false }) })) as unknown as typeof fetch;
    const deps = { state, wsUrl: "wss://api.example.com/ws", renderHud: () => {}, fetchImpl, now: () => now };
    refreshSectorListIfNeeded(deps);
    now = 59_000;
    refreshSectorListIfNeeded(deps);
    now = 61_000;
    refreshSectorListIfNeeded(deps);
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));
  });

  it("loads once per contest and redraws when the list arrives", async () => {
    const state = { joinSeasonId: "season-3", sectorListRows: [] as never[], sectorListLoadedFor: "" };
    const renderHud = vi.fn();
    const fetchImpl = vi.fn(async () => ({ json: async () => ({ ok: true, status: "active", houses: 1, maxHouses: 40, full: false }) })) as unknown as typeof fetch;
    refreshSectorListIfNeeded({ state, wsUrl: "wss://api.example.com/ws", renderHud, fetchImpl });
    refreshSectorListIfNeeded({ state, wsUrl: "wss://api.example.com/ws", renderHud, fetchImpl });
    await vi.waitFor(() => expect(renderHud).toHaveBeenCalled());
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(state.sectorListRows).toHaveLength(1);
  });
});

describe("join card with the sector list", () => {
  it("disables Land now when this sector is full and shows the greyed list", () => {
    const state = {
      needsSeasonJoin: true, joinSeasonOverlayOpen: true, joinSeasonId: "season-3", joinSeasonPending: false, seasonPending: false,
      seasonPendingScheduledStartAt: 0, seasonLobbyWaitingCount: 0, seasonLobbyMaxPlayers: 0, seasonLobbyRoster: [], profileSetupRequired: false,
      seasonStartedAt: 0, singleContest: false, joinSeasonClosedMessage: "", sectorListLoadedFor: "season-3",
      sectorListRows: buildSectorListRows({ publicBoard: board({ full: true, noLandingSite: true }) })
    };
    const overlayEl = document.createElement("div");
    const joinSeason = vi.fn(() => true);
    renderJoinSeasonOverlay({ state: state as never, overlayEl, renderHud: () => {}, joinSeason, wsUrl: "wss://api.example.com/ws" });
    const land = overlayEl.querySelector("#join-season-confirm") as HTMLButtonElement;
    expect(land.disabled).toBe(true);
    expect(land.textContent).toContain("This sector is full");
    expect(overlayEl.querySelector(".sector-list-row.is-full")).not.toBeNull();
  });
});

describe("join card when the sector is at its House cap (review regression)", () => {
  it("keeps Land now enabled, so a reserved place can get past the cap and others reach the waitlist", () => {
    const state = {
      needsSeasonJoin: true, joinSeasonOverlayOpen: true, joinSeasonId: "season-3", joinSeasonPending: false, seasonPending: false,
      seasonPendingScheduledStartAt: 0, seasonLobbyWaitingCount: 0, seasonLobbyMaxPlayers: 0, seasonLobbyRoster: [], profileSetupRequired: false,
      seasonStartedAt: 0, singleContest: false, joinSeasonClosedMessage: "", sectorListLoadedFor: `season-3:${Math.floor(Date.now() / 60_000)}`,
      sectorListRows: buildSectorListRows({ publicBoard: board({ houses: 40, full: true }) })
    };
    const overlayEl = document.createElement("div");
    renderJoinSeasonOverlay({ state: state as never, overlayEl, renderHud: () => {}, joinSeason: () => true, wsUrl: "wss://api.example.com/ws" });
    expect((overlayEl.querySelector("#join-season-confirm") as HTMLButtonElement).disabled).toBe(false);
    expect(overlayEl.querySelector(".sector-list-row.is-full")?.textContent).toContain("every House place is taken");
  });
});

// First-15 playtest 2026-11-28 (pt-strategist): "3 of 50 Houses" on the join card beside "Not met yet · 23" in
// Diplomacy. The cap counts player Houses; the AI Houses Diplomacy lists are now named beside it.
describe("Houses on the join card", () => {
  it("counts player Houses against the cap and adds the AI Houses", () => {
    expect(parseSectorBoard({ ok: true, status: "active", houses: 3, maxHouses: 50, aiHouses: 20, full: false })).toEqual(board({ houses: 3, maxHouses: 50, aiHouses: 20 }));
    const [row] = buildSectorListRows({ publicBoard: board({ houses: 3, maxHouses: 50, aiHouses: 20 }) });
    expect(row?.detail).toBe("3 of 50 player Houses + 20 AI");
    // An older server without the AI count still reads as player Houses.
    expect(buildSectorListRows({ publicBoard: board({ houses: 3, maxHouses: 50 }) })[0]?.detail).toBe("3 of 50 player Houses");
  });
});
