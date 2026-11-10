// @vitest-environment happy-dom
// The season-end screen's next-Sector-Contest button and the newcomer card.
import { describe, expect, it } from "vitest";
import { renderSeasonEndOverlay } from "../client-season-end-overlay.js";

const makeWinner = () => ({ playerId: "p1", playerName: "Alpha", crownedAt: 1700000000000, objectiveId: "TOWN_CONTROL", objectiveName: "Town Control" });

const makeLeaderboard = (overrides: Record<string, unknown> = {}) => ({
  overall: [{ id: "p1", rank: 1, name: "Alpha", score: 10, tiles: 10, incomePerMinute: 5, techs: 4, manpowerCap: 300 }],
  selfOverall: undefined,
  byTiles: [], byIncome: [], byTechs: [],
  ...overrides
});

const makeState = (overrides: Record<string, unknown> = {}) => ({
  me: "player-1",
  seasonWinner: undefined,
  seasonEndDismissed: false,
  seasonEndStarting: false,
  seasonStartVoteCount: 0, seasonStartVoted: false, seasonStartVoteThreshold: 10, authIsGuest: false, needsSeasonJoin: false, mapRevealEligible: false,
  leaderboard: makeLeaderboard(),
  seasonVictory: [],
  seasonStats: undefined,
  seasonScoreHistory: [],
  playerColors: new Map<string, string>(),
  ...overrides
});

describe("season-end next Sector Contest", () => {
  // Regression: the button said "Vote cast (n/5)" while the server started
  // the contest at 2 votes.
  it("shows the server's commitment threshold once committed", () => {
    const overlayEl = document.createElement("div");
    const state = makeState({ seasonWinner: makeWinner(), leaderboard: makeLeaderboard(), seasonStartVoted: true, seasonStartVoteCount: 4, seasonStartVoteThreshold: 10 });
    renderSeasonEndOverlay({ state: state as any, overlayEl, renderHud: () => {}, startNewSeason: () => {} });
    const footer = overlayEl.querySelector(".se-scroll-footer") as HTMLElement;
    expect(footer.innerHTML).toContain("You're in · 4/10 Houses committed");
    expect(footer.innerHTML).not.toContain("/5");
    expect(footer.innerHTML).toContain("starts once 10 Houses have committed");
    expect((overlayEl.querySelector("#se-new-season") as HTMLButtonElement).disabled).toBe(true);
  });

  // Regression: a guest's press counted toward resetting the world for everyone.
  it("offers a guest the save-your-empire panel instead of committing", () => {
    const overlayEl = document.createElement("div");
    const state = makeState({ seasonWinner: makeWinner(), leaderboard: makeLeaderboard(), authIsGuest: true });
    let committed = false;
    let savePanelOpened = false;
    renderSeasonEndOverlay({
      state: state as any,
      overlayEl,
      renderHud: () => {},
      startNewSeason: () => { committed = true; },
      openGuestSave: () => { savePanelOpened = true; }
    });
    expect(overlayEl.innerHTML).toContain("Save your empire to join the next Sector Contest");
    (overlayEl.querySelector("#se-new-season") as HTMLButtonElement).click();
    expect(committed).toBe(false);
    expect(savePanelOpened).toBe(true);
  });

  it("gives a newcomer who never played this world a short result card", () => {
    const overlayEl = document.createElement("div");
    const overall = Array.from({ length: 8 }, (_, index) => ({
      id: `p${index + 1}`, rank: index + 1, name: `House ${index + 1}`, score: 10 - index, tiles: 1, incomePerMinute: 1, techs: 1, manpowerCap: 1
    }));
    const state = makeState({ seasonWinner: makeWinner(), leaderboard: makeLeaderboard({ overall }), needsSeasonJoin: true });
    renderSeasonEndOverlay({ state: state as any, overlayEl, renderHud: () => {}, startNewSeason: () => {} });
    expect(overlayEl.querySelector(".se-tab-bar")).toBeNull();
    expect(overlayEl.innerHTML).toContain("You arrived after the crown was claimed");
    expect(overlayEl.querySelectorAll(".se-rank-list > *").length).toBe(5);
    expect(overlayEl.innerHTML).not.toContain("House 6");
    expect(overlayEl.querySelector("#se-look-around")).toBeTruthy();
  });
});
