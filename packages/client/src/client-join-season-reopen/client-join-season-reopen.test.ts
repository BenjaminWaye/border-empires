// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderJoinSeasonOverlay } from "../client-join-season-overlay.js";

// Review regression: with no automatic join, a player who pressed "Wait for the
// next contest" or closed the card could not open it again without reloading.
const baseState = () => ({
  needsSeasonJoin: true, joinSeasonOverlayOpen: true, joinSeasonId: "season-3", joinSeasonPending: false, seasonPending: false,
  seasonPendingScheduledStartAt: 0, seasonLobbyWaitingCount: 0, seasonLobbyMaxPlayers: 0, seasonLobbyRoster: [], profileSetupRequired: false,
  seasonStartedAt: 0, singleContest: false, joinSeasonClosedMessage: "", sectorListRows: [], sectorListLoadedFor: "",
  joinSeasonWaiting: false, authIsGuest: false, authEmail: "",
  leaderboard: { overall: [], selfOverall: undefined, byTiles: [], byIncome: [], byTechs: [] }, playerColors: new Map(), me: ""
});

afterEach(() => document.getElementById("join-season-reopen")?.remove());

describe("join card reopen button", () => {
  it("appears after Not now (a hosted sector) and opens the card again", () => {
    const state = { ...baseState(), singleContest: true };
    const overlayEl = document.createElement("div");
    const renderHud = vi.fn(() => renderJoinSeasonOverlay({ state: state as never, overlayEl, renderHud, joinSeason: () => true }));
    renderHud();
    expect(document.getElementById("join-season-reopen")).toBeNull();

    (overlayEl.querySelector("#join-season-wait") as HTMLButtonElement).click(); // "Not now" on a hosted sector
    expect(state.joinSeasonOverlayOpen).toBe(false);
    const reopen = document.getElementById("join-season-reopen") as HTMLButtonElement;
    expect(reopen.textContent).toBe("Join this Sector Contest");

    reopen.click();
    expect(state.joinSeasonOverlayOpen).toBe(true);
    expect(overlayEl.querySelector("#join-season-wait")).not.toBeNull(); // back on the join card, not the waiting view
    expect(document.getElementById("join-season-reopen")).toBeNull();
  });

  it("is not shown once the player has joined", () => {
    const state = { ...baseState(), needsSeasonJoin: false, joinSeasonOverlayOpen: false };
    renderJoinSeasonOverlay({ state: state as never, overlayEl: document.createElement("div"), renderHud: () => {}, joinSeason: () => true });
    expect(document.getElementById("join-season-reopen")).toBeNull();
  });
});
