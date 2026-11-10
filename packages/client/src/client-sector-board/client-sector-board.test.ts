// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";

import { createSectorBoardLoader, parseSectorBoard, sectorBoardHtml } from "./client-sector-board.js";

const render = (input: Partial<Parameters<typeof sectorBoardHtml>[0]> = {}): HTMLElement => {
  const el = document.createElement("div");
  el.innerHTML = sectorBoardHtml({ kicker: "Sector Contest", board: undefined, joining: false, waitHintHtml: "", lobbyPanelHtml: "", ...input });
  return el;
};

describe("sectorBoardHtml", () => {
  it("shows the open Sector with its Houses and a join button", () => {
    const el = render({ board: { seasonId: "season-9", houses: 42, maxHouses: 100, full: false, waitingCount: 3 } });
    const current = el.querySelector('[data-sector-card="current"]')!;
    expect(current.classList.contains("is-open")).toBe(true);
    expect(current.textContent).toContain("42 of 100 Houses");
    const button = el.querySelector<HTMLButtonElement>("#join-season-confirm")!;
    expect(button.disabled).toBe(false);
    expect(button.textContent).toContain("Join this Sector Contest");
    expect(el.querySelector('[data-sector-card="next"]')?.textContent).toContain("3 Houses waiting");
  });

  it("keeps joining possible on a full-looking Sector, since a refused join opens the waitlist (review regression)", () => {
    const el = render({ board: { seasonId: "season-9", houses: 100, maxHouses: 100, full: true, waitingCount: 1 } });
    expect(el.querySelector('[data-sector-card="current"]')?.classList.contains("is-full")).toBe(true);
    const button = el.querySelector<HTMLButtonElement>("#join-season-confirm")!;
    expect(button.disabled).toBe(false);
    expect(button.textContent).toContain("Sector looks full");
    expect(el.textContent).toContain("1 House waiting");
  });

  it("still offers joining before the counts load", () => {
    const el = render();
    expect(el.textContent).toContain("Counting Houses");
    expect(el.querySelector<HTMLButtonElement>("#join-season-confirm")?.disabled).toBe(false);
  });

  it("shows the joining state", () => {
    const button = render({ joining: true }).querySelector<HTMLButtonElement>("#join-season-confirm")!;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain("Joining...");
  });
});

describe("parseSectorBoard", () => {
  it("rejects malformed replies", () => {
    expect(parseSectorBoard({ ok: false, error: "season unavailable" })).toBeUndefined();
    expect(parseSectorBoard({ ok: true, houses: "1" })).toBeUndefined();
    expect(parseSectorBoard({ ok: true, houses: 1, maxHouses: 2, full: false, waitingCount: 0 })).toBeUndefined();
    expect(parseSectorBoard(null)).toBeUndefined();
  });
});

describe("createSectorBoardLoader", () => {
  const reply = (body: unknown) => ({ json: async () => body }) as unknown as Response;

  it("loads once per season and re-renders", async () => {
    const fetchImpl = vi.fn(async () => reply({ ok: true, seasonId: "season-9", status: "active", houses: 5, maxHouses: 100, full: false, waitingCount: 0 }));
    const rerender = vi.fn();
    const load = createSectorBoardLoader({ wsUrl: "wss://api.example.test/ws", rerender, fetchImpl });
    const state = { sectorBoard: undefined as ReturnType<typeof parseSectorBoard>, joinSeasonId: "season-9" };
    load(state);
    load(state);
    await vi.waitFor(() => expect(state.sectorBoard?.houses).toBe(5));
    load(state);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(expect.stringMatching(/\/sector\/board$/), expect.objectContaining({ method: "GET" }));
    expect(rerender).toHaveBeenCalledTimes(1);
  });

  it("waits before retrying a failed load", async () => {
    let t = 0;
    const fetchImpl = vi.fn(async () => {
      throw new Error("down");
    });
    const rerender = vi.fn();
    const timers: Array<{ callback: () => void; ms: number }> = [];
    const load = createSectorBoardLoader({ wsUrl: "wss://api.example.test/ws", rerender, fetchImpl, now: () => t, setTimeoutImpl: (callback, ms) => timers.push({ callback, ms }) });
    const state = { sectorBoard: undefined as ReturnType<typeof parseSectorBoard>, joinSeasonId: "season-9" };
    load(state);
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    t = 10_000;
    load(state);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    // The failure schedules the re-render that drives the retry (review regression:
    // the overlay only calls the loader when it renders).
    expect(timers).toEqual([{ callback: rerender, ms: 30_000 }]);
    t = 31_000;
    load(state);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("ignores a reply for another season and retries later", async () => {
    const fetchImpl = vi.fn(async () => reply({ ok: true, seasonId: "season-8", status: "ended", houses: 100, maxHouses: 100, full: true, waitingCount: 4 }));
    const timers: number[] = [];
    const load = createSectorBoardLoader({ wsUrl: "wss://api.example.test/ws", rerender: vi.fn(), fetchImpl, setTimeoutImpl: (_callback, ms) => timers.push(ms) });
    const state = { sectorBoard: undefined as ReturnType<typeof parseSectorBoard>, joinSeasonId: "season-9" };
    load(state);
    await vi.waitFor(() => expect(timers).toEqual([30_000]));
    expect(state.sectorBoard).toBeUndefined();
  });
});
