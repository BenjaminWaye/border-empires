// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { renderJoinSeasonOverlay } from "./client-join-season-overlay.js";

const makeState = (overrides: Record<string, unknown> = {}) => ({
  needsSeasonJoin: false,
  joinSeasonOverlayOpen: false,
  joinSeasonId: "",
  joinSeasonPending: false,
  seasonLobbyWaitingCount: 0,
  seasonLobbyMaxPlayers: 0,
  seasonLobbyRoster: [],
  myCountryFlag: "",
  ...overrides
});

const noopSetCountryFlag = () => true;

describe("join-season overlay", () => {
  it("is hidden when needsSeasonJoin is false", () => {
    const overlayEl = document.createElement("div");
    renderJoinSeasonOverlay({
      state: makeState() as any,
      overlayEl,
      renderHud: () => {},
      joinSeason: () => true,
      setCountryFlag: noopSetCountryFlag
    });
    expect(overlayEl.style.display).toBe("none");
    expect(overlayEl.innerHTML).toBe("");
  });

  it("is hidden when the player already dismissed it this session", () => {
    const overlayEl = document.createElement("div");
    renderJoinSeasonOverlay({
      state: makeState({ needsSeasonJoin: true, joinSeasonOverlayOpen: false }) as any,
      overlayEl,
      renderHud: () => {},
      joinSeason: () => true,
      setCountryFlag: noopSetCountryFlag
    });
    expect(overlayEl.style.display).toBe("none");
  });

  it("renders the join prompt with the season id when needed", () => {
    const overlayEl = document.createElement("div");
    renderJoinSeasonOverlay({
      state: makeState({ needsSeasonJoin: true, joinSeasonOverlayOpen: true, joinSeasonId: "season-42" }) as any,
      overlayEl,
      renderHud: () => {},
      joinSeason: () => true,
      setCountryFlag: noopSetCountryFlag
    });
    expect(overlayEl.style.display).toBe("grid");
    expect(overlayEl.innerHTML).toContain("season-42");
    expect(overlayEl.querySelector("#join-season-confirm")).toBeTruthy();
  });

  it("calls joinSeason and marks pending when the confirm button is clicked", () => {
    const overlayEl = document.createElement("div");
    const state = makeState({ needsSeasonJoin: true, joinSeasonOverlayOpen: true, joinSeasonId: "season-42" });
    const joinSeason = vi.fn(() => true);
    const renderHud = vi.fn();
    renderJoinSeasonOverlay({ state: state as any, overlayEl, renderHud, joinSeason, setCountryFlag: noopSetCountryFlag });
    const confirmBtn = overlayEl.querySelector("#join-season-confirm") as HTMLButtonElement;
    confirmBtn.click();
    expect(state.joinSeasonPending).toBe(true);
    expect(joinSeason).toHaveBeenCalledTimes(1);
    expect(renderHud).toHaveBeenCalledTimes(1);
  });

  it("closes the overlay when the close button is clicked", () => {
    const overlayEl = document.createElement("div");
    const state = makeState({ needsSeasonJoin: true, joinSeasonOverlayOpen: true });
    const renderHud = vi.fn();
    renderJoinSeasonOverlay({ state: state as any, overlayEl, renderHud, joinSeason: () => true, setCountryFlag: noopSetCountryFlag });
    const closeBtn = overlayEl.querySelector("#join-season-close") as HTMLButtonElement;
    closeBtn.click();
    expect(state.joinSeasonOverlayOpen).toBe(false);
    expect(renderHud).toHaveBeenCalledTimes(1);
  });

  it("does not mark pending when joinSeason fails to send (e.g. not authed yet)", () => {
    const overlayEl = document.createElement("div");
    const state = makeState({ needsSeasonJoin: true, joinSeasonOverlayOpen: true });
    const joinSeason = vi.fn(() => false);
    const renderHud = vi.fn();
    renderJoinSeasonOverlay({ state: state as any, overlayEl, renderHud, joinSeason, setCountryFlag: noopSetCountryFlag });
    const confirmBtn = overlayEl.querySelector("#join-season-confirm") as HTMLButtonElement;
    confirmBtn.click();
    expect(joinSeason).toHaveBeenCalledTimes(1);
    expect(state.joinSeasonPending).toBe(false);
  });

  it("does not re-trigger joinSeason while already pending", () => {
    const overlayEl = document.createElement("div");
    const state = makeState({ needsSeasonJoin: true, joinSeasonOverlayOpen: true, joinSeasonPending: true });
    const joinSeason = vi.fn(() => true);
    renderJoinSeasonOverlay({ state: state as any, overlayEl, renderHud: () => {}, joinSeason, setCountryFlag: noopSetCountryFlag });
    const confirmBtn = overlayEl.querySelector("#join-season-confirm") as HTMLButtonElement;
    confirmBtn.click();
    expect(joinSeason).not.toHaveBeenCalled();
  });

  it("shows the You're in confirmation, player count, and roster while pending", () => {
    const overlayEl = document.createElement("div");
    renderJoinSeasonOverlay({
      state: makeState({
        needsSeasonJoin: true,
        joinSeasonOverlayOpen: true,
        seasonPending: true,
        seasonPendingScheduledStartAt: Date.now() + 60_000,
        seasonLobbyWaitingCount: 3,
        seasonLobbyMaxPlayers: 120,
        seasonLobbyRoster: [
          { playerId: "p1", name: "Alice", countryFlag: "US" },
          { playerId: "p2", name: "Bob" }
        ]
      }) as any,
      overlayEl,
      renderHud: () => {},
      joinSeason: () => true,
      setCountryFlag: noopSetCountryFlag
    });
    expect(overlayEl.innerHTML).toContain("You're in");
    expect(overlayEl.innerHTML).toContain("3 / 120 PLAYERS");
    expect(overlayEl.innerHTML).toContain("Alice");
    expect(overlayEl.innerHTML).toContain("Bob");
    expect(overlayEl.querySelector("#season-lobby-discord")).toBeTruthy();
    expect(overlayEl.querySelector("#season-lobby-invite")).toBeTruthy();
  });

  it("shows a single clean title, not the raw season id duplicated, while pending", () => {
    const overlayEl = document.createElement("div");
    renderJoinSeasonOverlay({
      state: makeState({
        needsSeasonJoin: true,
        joinSeasonOverlayOpen: true,
        joinSeasonId: "season-8",
        seasonPending: true,
        seasonPendingScheduledStartAt: Date.now() + 60_000
      }) as any,
      overlayEl,
      renderHud: () => {},
      joinSeason: () => true,
      setCountryFlag: noopSetCountryFlag
    });
    const title = overlayEl.querySelector("#join-season-title") as HTMLElement;
    expect(title.textContent).toBe("Season starts soon");
    expect(title.textContent).not.toContain("season-8");
  });

  it("makes the lobby a full-screen page while pending, and restores the normal view once it stops being active", () => {
    document.body.classList.remove("season-lobby-active");
    const overlayEl = document.createElement("div");
    const state = makeState({
      needsSeasonJoin: true,
      joinSeasonOverlayOpen: true,
      seasonPending: true,
      seasonPendingScheduledStartAt: Date.now() + 60_000
    });
    renderJoinSeasonOverlay({
      state: state as any,
      overlayEl,
      renderHud: () => {},
      joinSeason: () => true,
      setCountryFlag: noopSetCountryFlag
    });
    expect(document.body.classList.contains("season-lobby-active")).toBe(true);

    // Player joins: seasonPending clears, overlay closes -> back to the
    // normal game view, canvas/HUD no longer suppressed.
    renderJoinSeasonOverlay({
      state: makeState() as any,
      overlayEl,
      renderHud: () => {},
      joinSeason: () => true,
      setCountryFlag: noopSetCountryFlag
    });
    expect(document.body.classList.contains("season-lobby-active")).toBe(false);
  });

  it("does not go full-screen for the plain join-now prompt (not the pending lobby)", () => {
    document.body.classList.remove("season-lobby-active");
    const overlayEl = document.createElement("div");
    renderJoinSeasonOverlay({
      state: makeState({ needsSeasonJoin: true, joinSeasonOverlayOpen: true, joinSeasonId: "season-42" }) as any,
      overlayEl,
      renderHud: () => {},
      joinSeason: () => true,
      setCountryFlag: noopSetCountryFlag
    });
    expect(document.body.classList.contains("season-lobby-active")).toBe(false);
  });

  it("shows the flag picker only when the player has not set one", () => {
    const overlayEl = document.createElement("div");
    renderJoinSeasonOverlay({
      state: makeState({ needsSeasonJoin: true, joinSeasonOverlayOpen: true, seasonPending: true, seasonPendingScheduledStartAt: Date.now() + 60_000 }) as any,
      overlayEl,
      renderHud: () => {},
      joinSeason: () => true,
      setCountryFlag: noopSetCountryFlag
    });
    expect(overlayEl.querySelector("#season-lobby-flag-select")).toBeTruthy();

    const overlayEl2 = document.createElement("div");
    renderJoinSeasonOverlay({
      state: makeState({ needsSeasonJoin: true, joinSeasonOverlayOpen: true, seasonPending: true, seasonPendingScheduledStartAt: Date.now() + 60_000, myCountryFlag: "US" }) as any,
      overlayEl: overlayEl2,
      renderHud: () => {},
      joinSeason: () => true,
      setCountryFlag: noopSetCountryFlag
    });
    expect(overlayEl2.querySelector("#season-lobby-flag-select")).toBeFalsy();
  });
});
