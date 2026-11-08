// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { renderSeasonEndOverlay } from "../client-season-end-overlay.js";

type State = Parameters<typeof renderSeasonEndOverlay>[0]["state"];
const stateForSummary = (): State => ({
  me: "visitor",
  seasonWinner: {
    playerId: "winner", playerName: "Nauticus", crownedAt: 1,
    objectiveId: "ECONOMIC_HEGEMONY", objectiveName: "Economic Ascendancy"
  },
  seasonEndDismissed: false,
  seasonEndStarting: false,
  seasonStartVoteCount: 0,
  seasonStartVoted: false,
  leaderboard: {
    overall: [{
      id: "winner", name: "Waypoint", rank: 1, score: 100, tiles: 50,
      incomePerMinute: 5, techs: 4, manpowerCap: 100
    }],
    byTiles: [], byIncome: [], byTechs: [],
    selfOverall: undefined, selfByTiles: undefined, selfByIncome: undefined, selfByTechs: undefined
  },
  seasonVictory: [],
  seasonStats: undefined,
  seasonScoreHistory: [],
  playerColors: new Map()
});

const render = (state: State, overlayEl = document.createElement("div")): HTMLDivElement => {
  renderSeasonEndOverlay({ state, overlayEl, renderHud: () => {}, startNewSeason: () => {} });
  return overlayEl;
};

describe("season summary recovery", () => {
  it("resolves the victor's current name and refreshes it after a rename", () => {
    const state = stateForSummary();
    const overlay = render(state);
    expect(overlay.querySelector(".se-victor-name")?.textContent).toBe("Waypoint");
    state.leaderboard.overall[0]!.name = "Renamed";
    render(state, overlay);
    expect(overlay.querySelector(".se-victor-name")?.textContent).toBe("Renamed");
  });

  it("keeps statistics and timeline accessible when an older season has no saved data", () => {
    const overlay = render(stateForSummary());
    expect(overlay.querySelector('.se-tab[data-tab="misc"]')).toBeTruthy();
    expect(overlay.querySelector('.se-tab[data-tab="score-graph"]')).toBeTruthy();
    expect(overlay.textContent).toContain("Longest Road");
    expect(overlay.textContent).toContain("Most Deadly Tile");
    expect(overlay.textContent).toContain("No score timeline was saved for this season.");
    (overlay.querySelector('.se-tab[data-tab="misc"]') as HTMLButtonElement).click();
    expect(overlay.querySelector('.se-tab-panel[data-tab="misc"]')?.classList.contains("is-active")).toBe(true);
  });

  it("reads saved records from the winner on a fresh login", () => {
    const state = stateForSummary();
    state.seasonWinner!.seasonStats = { longestRoad: { tileCount: 33 }, mostDeadlyTile: { x: 2, y: 3, manpowerLost: 222 } };
    state.seasonWinner!.scoreHistory = [{ playerId: "winner", playerName: "Waypoint", points: [{ t: 1, score: 1 }, { t: 2, score: 100 }] }];
    const overlay = render(state);
    expect(overlay.querySelector(".se-misc")?.textContent).toContain("33");
    expect(overlay.querySelector(".se-graph-svg")).toBeTruthy();
  });
});
