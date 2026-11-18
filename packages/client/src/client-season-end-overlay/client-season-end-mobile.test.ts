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
  lastContestRecap: { open: false, load: "idle" as const },
  seasonEndStarting: false,
  seasonStartError: undefined as string | undefined,
  seasonStartVoteCount: 0,
  seasonStartVoted: false, seasonStartVoteThreshold: 10, authIsGuest: false, needsSeasonJoin: false,
  mapRevealEligible: false,
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

  it.each([
    ["deadliest-tile", "Most Deadly Tile", "No combat record available."],
    ["longest-road", "Longest Road", "No connected road recorded."],
    ["timeline", "Score timeline", "No score timeline was saved for this Sector Contest."]
  ])("opens a prefilled bug report beside the missing %s message", (section, record, message) => {
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
    const notice = button?.closest(".se-missing-history");
    expect(notice?.textContent).toContain(message);
    expect(button?.getAttribute("aria-label")).toBe(`Report a bug for ${record}`);
    const descriptionId = button!.getAttribute("aria-describedby");
    expect(notice?.querySelector(`[id="${descriptionId}"]`)?.textContent).toBe(message);
    button!.click();
    expect(isReportOpen("bug")).toBe(true);
    const description = hud.querySelector<HTMLTextAreaElement>("[data-bug-report-description]")!;
    expect(description.value).toContain(`historical data: ${record}.`);
    expect(description.value).toContain(`Observed: ${message}`);
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

  it("uses current player names in victory paths and the score graph too", () => {
    const state = stateForSummary();
    state.seasonVictory = [{ id: "ECONOMIC_HEGEMONY", name: "Economic Ascendancy", description: "Lead income",
      leaderPlayerId: "winner", leaderName: "Nauticus", progressLabel: "33% lead", thresholdLabel: "Hold the lead",
      holdDurationSeconds: 86400, statusLabel: "Winner crowned: Nauticus", conditionMet: true }];
    state.seasonScoreHistory = [{ playerId: "winner", playerName: "Nauticus", points: [{ t: 1, score: 1 }, { t: 2, score: 2 }] }];
    const overlay = render(state);
    expect(overlay.querySelector(".se-dial-status")?.textContent).toBe("Winner crowned: Waypoint");
    expect(overlay.querySelector(".se-dial-leader")?.textContent).toContain("Waypoint");
    expect(overlay.querySelector(".se-graph-legend")?.textContent).toContain("Waypoint");
    expect(overlay.textContent).not.toContain("Nauticus");
  });

  it("keeps statistics and timeline accessible when an older season has no saved data", () => {
    const overlay = render(stateForSummary());
    expect(overlay.querySelector('.se-tab[data-tab="misc"]')).toBeTruthy();
    expect(overlay.querySelector('.se-tab[data-tab="score-graph"]')).toBeTruthy();
    expect(overlay.textContent).toContain("Longest Road");
    expect(overlay.textContent).toContain("Most Deadly Tile");
    expect(overlay.textContent).toContain("No score timeline was saved for this Sector Contest.");
    (overlay.querySelector('.se-tab[data-tab="misc"]') as HTMLButtonElement).click();
    expect(overlay.querySelector('.se-tab-panel[data-tab="misc"]')?.classList.contains("is-active")).toBe(true);
  });

  it("offers a bug report for older records missing player and city details", () => {
    const state = stateForSummary();
    state.seasonStats = undefined;
    state.seasonWinner!.seasonStats = { longestRoad: { tileCount: 20 }, mostDeadlyTile: { x: 1, y: 2, manpowerLost: 100 } };
    const overlay = render(state);
    expect(overlay.textContent).toContain("Player loss history unavailable.");
    expect(overlay.textContent).toContain("Road owner and city details unavailable.");
    expect(overlay.querySelector('[data-se-missing-records="Longest Road owner and cities"]')
      ?.closest(".se-misc-item")?.textContent).toContain("Longest Road");
    expect(overlay.querySelector('[data-se-missing-records="Deadliest tile player losses"]')
      ?.closest(".se-misc-item")?.textContent).toContain("Most Deadly Tile");
  });

  it("shows archived scores when the season has just one sample per player", () => {
    const state = stateForSummary();
    state.seasonWinner!.scoreHistory = [
      { playerId: "winner", playerName: "Nauticus", points: [{ t: 1, score: 100 }] },
      { playerId: "other", playerName: "Other", points: [{ t: 1, score: 75 }] }
    ];
    state.seasonScoreHistory = [
      { playerId: "winner", playerName: "Waypoint", points: [{ t: 2, score: 200 }] }
    ];

    const overlay = render(state);
    const scores = overlay.querySelector(".se-graph");
    expect(scores?.textContent).toContain("Only one score sample per empire was saved.");
    expect(scores?.textContent).toContain("Waypoint");
    expect(scores?.textContent).toContain("100");
    expect(scores?.textContent).toContain("75");
    expect(scores?.textContent).not.toContain("200");
    expect(scores?.textContent).not.toContain("No score timeline was saved");
    expect(scores?.querySelector('[data-se-report-missing="timeline"]')?.closest(".se-missing-history")
      ?.textContent).toContain("Only one score sample per empire was saved.");
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
