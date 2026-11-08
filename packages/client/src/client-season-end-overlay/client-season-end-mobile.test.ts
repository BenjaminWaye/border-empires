// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { renderSeasonEndOverlay } from "../client-season-end-overlay.js";

import { renderBugReportOverlay } from "../client-bug-report/client-bug-report-hud.js";
import { isReportOpen, setReportOpen } from "../client-bug-report/client-bug-report.js";
import { createInitialState } from "../client-state/client-state.js";

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
  afterEach(() => {
    document.querySelector<HTMLButtonElement>("[data-bug-report-cancel]")?.click();
    setReportOpen("bug", false);
    document.body.innerHTML = "";
  });

  it.each(["statistics", "timeline"])("opens a prefilled bug report for missing %s without dismissing the summary", (section) => {
    const state = Object.assign(createInitialState(), stateForSummary());
    const hud = document.createElement("div");
    hud.id = "hud";
    const overlayEl = document.createElement("div");
    hud.appendChild(overlayEl);
    document.body.appendChild(hud);
    const renderHud = (): void => {
      renderBugReportOverlay({ state, dom: { hud }, wsUrl: "ws://localhost:3101/ws", renderHud });
      renderSeasonEndOverlay({ state, overlayEl, renderHud, startNewSeason: () => {} });
    };
    renderHud();
    const button = overlayEl.querySelector<HTMLButtonElement>(`[data-se-report-missing="${section}"]`);
    expect(button).toBeTruthy();
    button!.click();
    expect(isReportOpen("bug")).toBe(true);
    const description = hud.querySelector<HTMLTextAreaElement>("[data-bug-report-description]")!;
    expect(description.value).toContain(section === "timeline" ? "Score timeline" : "Most Deadly Tile, Longest Road");
    expect(description.value).toContain("winner");
    expect(hud.querySelector("[data-bug-report-char-count]")?.textContent).toBe(String(description.value.length));
    expect(state.seasonEndDismissed).toBe(false);
    hud.querySelector<HTMLButtonElement>("[data-bug-report-cancel]")!.click();
    expect(isReportOpen("bug")).toBe(false);
    expect(overlayEl.style.display).toBe("grid");
  });

  it("resolves the victor's current name and refreshes it after a rename", () => {
    const state = stateForSummary();
    const overlay = render(state);
    expect(overlay.querySelector(".se-victor-name")?.textContent).toBe("Waypoint");
    state.leaderboard.overall[0]!.name = "Renamed";
    render(state, overlay);
    expect(overlay.querySelector(".se-victor-name")?.textContent).toBe("Renamed");
  });

  it("refreshes a detached self-player name used in the record details", () => {
    const state = stateForSummary();
    const self = { ...state.leaderboard.overall[0]!, id: "detached", name: "Before", rank: 30 };
    state.leaderboard.selfOverall = self;
    state.seasonStats = { longestRoad: { tileCount: 12, playerId: self.id, playerName: "Old" } };
    const overlay = render(state);
    expect(overlay.querySelector(".se-misc")?.textContent).toContain("Before");
    state.leaderboard.selfOverall = { ...self, name: "After" };
    render(state, overlay);
    expect(overlay.querySelector(".se-misc")?.textContent).toContain("After");
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

  it("offers a bug report for older records missing player and city details", () => {
    const state = stateForSummary();
    state.seasonStats = undefined;
    state.seasonWinner!.seasonStats = { longestRoad: { tileCount: 20 }, mostDeadlyTile: { x: 1, y: 2, manpowerLost: 100 } };
    const overlay = render(state);
    expect(overlay.textContent).toContain("Player loss history unavailable.");
    expect(overlay.textContent).toContain("City details unavailable.");
    const button = overlay.querySelector<HTMLButtonElement>('[data-se-report-missing="statistics"]');
    expect(button?.dataset.seMissingRecords).toContain("Longest Road owner and cities");
    expect(button?.dataset.seMissingRecords).toContain("Deadliest tile player losses");
  });

  it("reads saved records from the winner on a fresh login", () => {
    const state = stateForSummary();
    state.seasonWinner!.seasonStats = {
      longestRoad: { tileCount: 33, playerId: "winner", playerName: "Old name",
        fromCity: { x: 5, y: 6, name: "Port Brass" }, toCity: { x: 9, y: 10, name: "Northgate" } },
      mostDeadlyTile: { x: 2, y: 3, manpowerLost: 222,
        mostLossesPlayer: { playerId: "winner", playerName: "Old name", manpowerLost: 150 } }
    };
    state.seasonWinner!.scoreHistory = [{ playerId: "winner", playerName: "Waypoint", points: [{ t: 1, score: 1 }, { t: 2, score: 100 }] }];
    const overlay = render(state);
    const records = overlay.querySelector(".se-misc")?.textContent;
    expect(records).toContain("33");
    expect(records).toContain("Port Brass (5, 6) ↔ Northgate (9, 10)");
    expect(records).toContain("Waypoint");
    expect(records).toContain("150");
    expect(records).toContain("tile (2, 3)");
    expect(records).not.toContain("Old name");
    expect(overlay.querySelector(".se-graph-svg")).toBeTruthy();
    expect(overlay.querySelector("[data-se-report-missing]")).toBeNull();
  });
});
