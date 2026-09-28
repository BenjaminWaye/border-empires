// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetGuestAutoJoinForTests } from "./client-guest-play/client-guest-play.js";
import { renderJoinSeasonOverlay } from "./client-join-season-overlay.js";

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

describe("join-season overlay for guests", () => {
  beforeEach(() => {
    resetGuestAutoJoinForTests();
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

  it("keeps the ordinary prompt, with no automatic join, for a real account", () => {
    const state = makeState({ authIsGuest: false });
    const joinSeason = vi.fn(() => true);

    const overlayEl = render(state, joinSeason);

    expect(joinSeason).not.toHaveBeenCalled();
    expect((overlayEl.querySelector("#join-season-confirm") as HTMLButtonElement).disabled).toBe(false);
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
});
