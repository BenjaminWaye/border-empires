// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetAutoJoinForTests } from "./client-join-season-auto-join/client-join-season-auto-join.js";
import { JOIN_SEASON_PENDING_WATCHDOG_MS, renderJoinSeasonOverlay } from "./client-join-season-overlay.js";
import { applySeasonFullError } from "./client-season-full-error.js";

const makeState = (overrides: Record<string, unknown> = {}) => ({
  needsSeasonJoin: true,
  joinSeasonOverlayOpen: true,
  joinSeasonId: "season-7",
  joinSeasonPending: false,
  seasonPending: false,
  seasonPendingScheduledStartAt: 0,
  seasonLobbyWaitingCount: 0,
  seasonLobbyMaxPlayers: 0,
  seasonLobbyRoster: [],
  profileSetupRequired: false,
  authIsGuest: false,
  ...overrides
});

const render = (state: ReturnType<typeof makeState>, joinSeason: () => boolean) => {
  const overlayEl = document.createElement("div");
  renderJoinSeasonOverlay({ state: state as any, overlayEl, renderHud: () => {}, joinSeason });
  return overlayEl;
};

describe("join-season overlay auto-join", () => {
  beforeEach(() => {
    resetAutoJoinForTests();
    document.body.classList.remove("season-lobby-active");
  });

  it("sends a guest straight into an active season and shows the prompt as already joining", () => {
    const state = makeState({ authIsGuest: true });
    const joinSeason = vi.fn(() => true);

    const overlayEl = render(state, joinSeason);

    expect(joinSeason).toHaveBeenCalledTimes(1);
    expect(state.joinSeasonPending).toBe(true);
    expect((overlayEl.querySelector("#join-season-confirm") as HTMLButtonElement).disabled).toBe(true);
  });

  it("joins a guest once, however many times the HUD re-renders", () => {
    const state = makeState({ authIsGuest: true });
    const joinSeason = vi.fn(() => true);

    for (let i = 0; i < 5; i += 1) render(state, joinSeason);

    expect(joinSeason).toHaveBeenCalledTimes(1);
  });

  it("does not mark the join as pending when the message could not be sent", () => {
    const state = makeState({ authIsGuest: true });

    render(state, () => false);

    expect(state.joinSeasonPending).toBe(false);
  });

  it("sends a signed-in player straight in too, with no Choose-your-Sector screen (regression)", () => {
    // Players opening the app wanted to play; the old board made them find a
    // join button under Discord/invite links while the map was hidden.
    const state = makeState({ authIsGuest: false });
    const joinSeason = vi.fn(() => true);

    const overlayEl = render(state, joinSeason);

    expect(joinSeason).toHaveBeenCalledTimes(1);
    expect(state.joinSeasonPending).toBe(true);
    expect(overlayEl.textContent).not.toContain("Choose your Sector");
  });

  it("leaves a guest in the lobby countdown of a pending season instead of joining early", () => {
    const state = makeState({ authIsGuest: true, seasonPending: true, seasonPendingScheduledStartAt: Date.now() + 3_600_000 });
    const joinSeason = vi.fn(() => true);

    render(state, joinSeason);

    expect(joinSeason).not.toHaveBeenCalled();
  });

  it("waits for the name and colour step before joining", () => {
    const state = makeState({ authIsGuest: true, profileSetupRequired: true });
    const joinSeason = vi.fn(() => true);

    render(state, joinSeason);

    expect(joinSeason).not.toHaveBeenCalled();
  });
  it("does not re-send the join forever when the simulation stalls past the watchdog (review regression)", () => {
    vi.useFakeTimers();
    try {
      const state = makeState();
      const overlayEl = document.createElement("div");
      const joinSeason = vi.fn(() => true);
      const renderHud = (): void => renderJoinSeasonOverlay({ state: state as any, overlayEl, renderHud, joinSeason });
      renderHud();
      expect(joinSeason).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(JOIN_SEASON_PENDING_WATCHDOG_MS * 3);
      expect(joinSeason).toHaveBeenCalledTimes(1);
      expect(state.joinSeasonPending).toBe(false);
      expect(overlayEl.querySelector("#join-season-confirm")?.textContent).toContain("Play");
      expect(overlayEl.querySelector("#join-season-close")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("closes the fullscreen join card when the Sector is full, so the waitlist is reachable (review regression)", () => {
    const state = { ...makeState(), seasonFull: false, authSessionReady: true, authRetrying: false, authBusy: false, authBusyStartedAt: 0, authBusyTitle: "", authBusyDetail: "" };
    const overlayEl = document.createElement("div");
    renderJoinSeasonOverlay({ state: state as any, overlayEl, renderHud: () => {}, joinSeason: () => true });
    expect(document.body.classList.contains("season-lobby-active")).toBe(true);
    state.joinSeasonPending = false;
    applySeasonFullError(state, "");
    renderJoinSeasonOverlay({ state: state as any, overlayEl, renderHud: () => {}, joinSeason: () => true });
    expect(overlayEl.style.display).toBe("none");
    expect(document.body.classList.contains("season-lobby-active")).toBe(false);
  });
});
