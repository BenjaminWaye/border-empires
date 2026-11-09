// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { formatJoinSeasonLabel, renderJoinSeasonOverlay } from "./client-join-season-overlay.js";

const makeState = (overrides: Record<string, unknown> = {}) => ({
  needsSeasonJoin: true,
  joinSeasonOverlayOpen: true,
  joinSeasonId: "",
  joinSeasonPending: false,
  seasonLobbyWaitingCount: 0,
  seasonLobbyMaxPlayers: 0,
  seasonLobbyRoster: [],
  ...overrides
});

describe("join-season overlay after the season has ended", () => {
  it("stays hidden once the season has a winner, so the season-end screen is shown instead", () => {
    document.body.classList.remove("season-lobby-active");
    const overlayEl = document.createElement("div");
    const joinSeason = vi.fn(() => true);
    renderJoinSeasonOverlay({
      state: makeState({ seasonWinner: { playerId: "p-astrid", playerName: "Astrid", crownedAt: 1 } }) as any,
      overlayEl,
      renderHud: () => {},
      joinSeason
    });
    expect(overlayEl.style.display).toBe("none");
    expect(overlayEl.querySelector("#join-season-confirm")).toBeNull();
    expect(document.body.classList.contains("season-lobby-active")).toBe(false);
    expect(joinSeason).not.toHaveBeenCalled();
  });

  it("clears the Joining... spinner when the pending flag is dropped without a re-render (regression: endless loading)", () => {
    vi.useFakeTimers();
    try {
      const overlayEl = document.createElement("div");
      const state = makeState({ joinSeasonPending: true }) as any;
      const renderHud = vi.fn(() => renderJoinSeasonOverlay({ state, overlayEl, renderHud, joinSeason: () => true }));
      renderJoinSeasonOverlay({ state, overlayEl, renderHud, joinSeason: () => true });
      expect(overlayEl.querySelector("#join-season-confirm")?.classList.contains("is-joining")).toBe(true);
      // An ERROR handler clears the flag but never asks the HUD to redraw.
      state.joinSeasonPending = false;
      vi.advanceTimersByTime(1_100);
      const btn = overlayEl.querySelector<HTMLButtonElement>("#join-season-confirm");
      expect(btn?.classList.contains("is-joining")).toBe(false);
      expect(btn?.disabled).toBe(false);
      expect(overlayEl.querySelector("#join-season-wait-hint")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("formatJoinSeasonLabel", () => {
  it("does not repeat the word season for prefixed ids", () => {
    expect(formatJoinSeasonLabel("season-13")).toBe("Season 13");
    expect(formatJoinSeasonLabel("Season 4")).toBe("Season 4");
    expect(formatJoinSeasonLabel("42")).toBe("Season 42");
  });
});
