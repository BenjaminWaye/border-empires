// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderJoinSeasonOverlay } from "../client-join-season-overlay.js";

// Review regression: with no automatic join, a player who pressed "Wait for the
// next contest" or closed the card could not open it again without reloading.
const baseState = () => ({
  needsSeasonJoin: true, joinSeasonOverlayOpen: true, joinSeasonId: "season-3", joinSeasonPending: false, seasonPending: false,
  seasonPendingScheduledStartAt: 0, seasonLobbyWaitingCount: 0, seasonLobbyMaxPlayers: 0, seasonLobbyRoster: [], profileSetupRequired: false,
  seasonStartedAt: 0, singleContest: false, joinSeasonClosedMessage: "", sectorListRows: [], sectorListLoadedFor: ""
});

afterEach(() => document.getElementById("join-season-reopen")?.remove());

describe("join card reopen button", () => {
  it("appears after Wait and opens the card again", () => {
    const state = baseState();
    const overlayEl = document.createElement("div");
    const renderHud = vi.fn(() => renderJoinSeasonOverlay({ state: state as never, overlayEl, renderHud, joinSeason: () => true }));
    renderHud();
    expect(document.getElementById("join-season-reopen")).toBeNull();

    (overlayEl.querySelector("#join-season-wait") as HTMLButtonElement).click();
    expect(state.joinSeasonOverlayOpen).toBe(false);
    const reopen = document.getElementById("join-season-reopen") as HTMLButtonElement;
    expect(reopen.textContent).toBe("Join this Sector Contest");

    reopen.click();
    expect(state.joinSeasonOverlayOpen).toBe(true);
    expect(overlayEl.querySelector("#join-season-confirm")).not.toBeNull();
    expect(document.getElementById("join-season-reopen")).toBeNull();
  });

  it("is not shown once the player has joined", () => {
    const state = { ...baseState(), needsSeasonJoin: false, joinSeasonOverlayOpen: false };
    renderJoinSeasonOverlay({ state: state as never, overlayEl: document.createElement("div"), renderHud: () => {}, joinSeason: () => true });
    expect(document.getElementById("join-season-reopen")).toBeNull();
  });
});
