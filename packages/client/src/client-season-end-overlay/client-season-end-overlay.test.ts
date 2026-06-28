// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { renderSeasonEndOverlay } from "../client-season-end-overlay.js";

const makeState = (overrides: Record<string, unknown> = {}) => ({
  me: "player-1",
  seasonWinner: undefined,
  seasonEndDismissed: false,
  seasonEndStarting: false,
  leaderboard: {
    overall: [] as { id: string; rank: number; name: string; score: number; tiles: number; incomePerMinute: number; techs: number }[],
    selfOverall: undefined,
    selfByTiles: undefined,
    selfByIncome: undefined,
    selfByTechs: undefined,
    byTiles: [] as { id: string; rank: number; name: string; value: number }[],
    byIncome: [] as { id: string; rank: number; name: string; value: number }[],
    byTechs: [] as { id: string; rank: number; name: string; value: number }[]
  },
  seasonVictory: [],
  playerColors: new Map<string, string>(),
  ...overrides
});

const makeWinner = (overrides: Record<string, unknown> = {}) => ({
  playerId: "player-1",
  playerName: "Nauticus",
  crownedAt: 1700000000000,
  objectiveId: "TOWN_CONTROL",
  objectiveName: "Town Control",
  ...overrides
});

const makeLeaderboard = (overrides: Record<string, unknown> = {}) => ({
  overall: [
    { id: "p1", rank: 1, name: "Alpha", score: 10, tiles: 10, incomePerMinute: 5, techs: 4 },
    { id: "p2", rank: 2, name: "Beta", score: 9, tiles: 9, incomePerMinute: 4, techs: 3 },
    { id: "p3", rank: 3, name: "Gamma", score: 8, tiles: 8, incomePerMinute: 3, techs: 2 }
  ],
  selfOverall: { id: "player-1", rank: 5, name: "Nauticus", score: 6, tiles: 6, incomePerMinute: 2, techs: 1 },
  selfByTiles: undefined,
  selfByIncome: undefined,
  selfByTechs: undefined,
  byTiles: [] as { id: string; rank: number; name: string; value: number }[],
  byIncome: [] as { id: string; rank: number; name: string; value: number }[],
  byTechs: [] as { id: string; rank: number; name: string; value: number }[],
  ...overrides
});

const makeVictoryCondition = (overrides: Record<string, unknown> = {}) => ({
  id: "TOWN_CONTROL",
  name: "Town Control",
  description: "Hold 50% of towns.",
  leaderPlayerId: "player-1",
  leaderName: "Nauticus",
  progressLabel: "20/87 towns",
  thresholdLabel: "Need 87 towns",
  holdDurationSeconds: 86400,
  statusLabel: "Pressure building",
  conditionMet: false,
  ...overrides
});

describe("season-end overlay", () => {
  it("is hidden when seasonWinner is not set", () => {
    const overlayEl = document.createElement("div");
    renderSeasonEndOverlay({
      state: makeState() as any,
      overlayEl,
      renderHud: () => {},
      startNewSeason: () => {}
    });
    expect(overlayEl.style.display).toBe("none");
    expect(overlayEl.innerHTML).toBe("");
  });

  it("is hidden when seasonEndDismissed is true", () => {
    const overlayEl = document.createElement("div");
    renderSeasonEndOverlay({
      state: makeState({ seasonWinner: makeWinner(), seasonEndDismissed: true }) as any,
      overlayEl,
      renderHud: () => {},
      startNewSeason: () => {}
    });
    expect(overlayEl.style.display).toBe("none");
  });

  it("shows overlay when seasonWinner is set", () => {
    const overlayEl = document.createElement("div");
    const state = makeState({
      seasonWinner: makeWinner(),
      leaderboard: makeLeaderboard()
    });
    renderSeasonEndOverlay({
      state: state as any,
      overlayEl,
      renderHud: () => {},
      startNewSeason: () => {}
    });
    expect(overlayEl.style.display).toBe("grid");
    expect(overlayEl.innerHTML).toContain("Season Concluded");
    expect(overlayEl.querySelector("#se-look-around")).toBeTruthy();
    expect(overlayEl.querySelector("#se-new-season")).toBeTruthy();
  });

  it("renders victor medallion with the season winner", () => {
    const overlayEl = document.createElement("div");
    renderSeasonEndOverlay({
      state: makeState({
        seasonWinner: makeWinner({ playerId: "p1", playerName: "Alpha" }),
        leaderboard: makeLeaderboard()
      }) as any,
      overlayEl,
      renderHud: () => {},
      startNewSeason: () => {}
    });
    expect(overlayEl.innerHTML).toContain("Season Victor");
    expect(overlayEl.innerHTML).toContain("Alpha");
    expect(overlayEl.innerHTML).toContain("♛");
  });

  it('shows "You" for the current player in the victor medallion', () => {
    const overlayEl = document.createElement("div");
    renderSeasonEndOverlay({
      state: makeState({
        seasonWinner: makeWinner(),
        leaderboard: makeLeaderboard()
      }) as any,
      overlayEl,
      renderHud: () => {},
      startNewSeason: () => {}
    });
    const html = overlayEl.innerHTML;
    expect(html).toContain("You");
    expect(html).not.toContain(">Nauticus<");
  });

  it("crowns the season winner in standings, not rank 1", () => {
    const overlayEl = document.createElement("div");
    // winner is Gamma (rank 3), not rank 1 (Alpha)
    renderSeasonEndOverlay({
      state: makeState({
        seasonWinner: makeWinner({ playerId: "p3", playerName: "Gamma" }),
        leaderboard: makeLeaderboard()
      }) as any,
      overlayEl,
      renderHud: () => {},
      startNewSeason: () => {}
    });
    const standings = overlayEl.innerHTML.slice(overlayEl.innerHTML.indexOf("Final Standings"));
    expect(standings).toContain("♔");
    // ♔ should be before the second occurrence of Gamma (standings row, not victor)
    const firstGamma = overlayEl.innerHTML.indexOf(">Gamma<");
    const secondGamma = overlayEl.innerHTML.indexOf(">Gamma<", firstGamma + 1);
    const beforeSecondGamma = overlayEl.innerHTML.slice(0, secondGamma);
    expect(beforeSecondGamma.lastIndexOf("♔")).toBeGreaterThan(-1);
  });

  it("crowns rank 1 when they are also the season winner", () => {
    const overlayEl = document.createElement("div");
    renderSeasonEndOverlay({
      state: makeState({
        seasonWinner: makeWinner({ playerId: "p1", playerName: "Alpha" }),
        leaderboard: makeLeaderboard()
      }) as any,
      overlayEl,
      renderHud: () => {},
      startNewSeason: () => {}
    });
    const html = overlayEl.innerHTML;
    // ♔ should appear somewhere
    expect(html).toContain("♔");
    // ♔ should be near Alpha's standings row (second occurrence)
    const firstAlpha = html.indexOf(">Alpha<");
    const secondAlpha = html.indexOf(">Alpha<", firstAlpha + 1);
    expect(secondAlpha).toBeGreaterThan(-1);
    const beforeStandingsAlpha = html.slice(0, secondAlpha);
    expect(beforeStandingsAlpha.lastIndexOf("♔")).toBeGreaterThan(-1);
  });

  it("shows 'You' in victory gauge when player leads the objective", () => {
    const overlayEl = document.createElement("div");
    const state = makeState({
      seasonWinner: makeWinner(),
      leaderboard: makeLeaderboard(),
      seasonVictory: [makeVictoryCondition()]
    });
    renderSeasonEndOverlay({ state: state as any, overlayEl, renderHud: () => {}, startNewSeason: () => {} });
    const html = overlayEl.innerHTML;
    expect(html).toContain("You");
    expect(html).toContain("20/87 towns");
    expect(html).not.toContain(">Nauticus<");
  });

  it("shows self-progress 'You:' line when player is not the objective leader", () => {
    const overlayEl = document.createElement("div");
    const state = makeState({
      seasonWinner: makeWinner(),
      leaderboard: makeLeaderboard(),
      seasonVictory: [
        makeVictoryCondition({
          id: "ECONOMIC_HEGEMONY",
          name: "Economic Ascendancy",
          leaderPlayerId: "p1",
          leaderName: "Alpha",
          progressLabel: "59.7 gold/m vs 47.4",
          selfProgressLabel: "12.0 gold/m",
          thresholdLabel: "Need at least 200 gold/m and 33% lead"
        })
      ]
    });
    renderSeasonEndOverlay({ state: state as any, overlayEl, renderHud: () => {}, startNewSeason: () => {} });
    const html = overlayEl.innerHTML;
    expect(html).toContain("You: 12.0 gold/m");
    expect(html).toContain(">Alpha<");
  });

  it("does not duplicate self-progress when player is the objective leader", () => {
    const overlayEl = document.createElement("div");
    const state = makeState({
      seasonWinner: makeWinner(),
      leaderboard: makeLeaderboard(),
      seasonVictory: [
        makeVictoryCondition({ selfProgressLabel: "20/87 towns" })
      ]
    });
    renderSeasonEndOverlay({ state: state as any, overlayEl, renderHud: () => {}, startNewSeason: () => {} });
    expect(overlayEl.innerHTML).not.toContain("You: 20/87 towns");
  });

  it("disables start button when seasonEndStarting is true", () => {
    const overlayEl = document.createElement("div");
    const state = makeState({
      seasonWinner: makeWinner(),
      leaderboard: makeLeaderboard(),
      seasonEndStarting: true
    });
    renderSeasonEndOverlay({ state: state as any, overlayEl, renderHud: () => {}, startNewSeason: () => {} });
    const newSeasonBtn = overlayEl.querySelector("#se-new-season") as HTMLButtonElement;
    expect(newSeasonBtn.disabled).toBe(true);
    expect(overlayEl.innerHTML).toContain("Winding the Spring");
  });

  it("renders all leaderboard entries in final standings", () => {
    const overlayEl = document.createElement("div");
    const state = makeState({
      seasonWinner: makeWinner(),
      leaderboard: makeLeaderboard()
    });
    renderSeasonEndOverlay({ state: state as any, overlayEl, renderHud: () => {}, startNewSeason: () => {} });
    const html = overlayEl.innerHTML;
    expect(html).toContain("Final Standings");
    expect(html).toContain("Alpha");
    expect(html).toContain("Beta");
    expect(html).toContain("Gamma");
    expect(html).toContain("You");
  });

  it("re-renders idempotently with same inputs", () => {
    const overlayEl = document.createElement("div");
    const deps = {
      state: makeState({ seasonWinner: makeWinner(), leaderboard: makeLeaderboard() }) as any,
      overlayEl,
      renderHud: () => {},
      startNewSeason: () => {}
    };
    renderSeasonEndOverlay(deps);
    const firstHtml = overlayEl.innerHTML;
    renderSeasonEndOverlay(deps);
    expect(overlayEl.innerHTML).toBe(firstHtml);
  });

  it("dismisses overlay and calls renderHud when Look Around is clicked", () => {
    const overlayEl = document.createElement("div");
    const state = makeState({ seasonWinner: makeWinner(), leaderboard: makeLeaderboard() });
    let hudCalled = false;
    renderSeasonEndOverlay({
      state: state as any,
      overlayEl,
      renderHud: () => { hudCalled = true; },
      startNewSeason: () => {}
    });
    const lookAround = overlayEl.querySelector("#se-look-around") as HTMLButtonElement;
    lookAround.click();
    expect(state.seasonEndDismissed).toBe(true);
    expect(hudCalled).toBe(true);
  });

  it("starts new season on button click after confirmation", () => {
    const overlayEl = document.createElement("div");
    const state = makeState({ seasonWinner: makeWinner(), leaderboard: makeLeaderboard() });
    let newSeasonStarted = false;
    const origConfirm = window.confirm;
    window.confirm = () => true;
    try {
      renderSeasonEndOverlay({
        state: state as any,
        overlayEl,
        renderHud: () => {},
        startNewSeason: () => { newSeasonStarted = true; }
      });
      const newSeasonBtn = overlayEl.querySelector("#se-new-season") as HTMLButtonElement;
      newSeasonBtn.click();
      expect(newSeasonStarted).toBe(true);
      expect(state.seasonEndStarting).toBe(true);
    } finally {
      window.confirm = origConfirm;
    }
  });

  it("uses state.me as fallback for selfId when leaderboard.selfOverall is missing", () => {
    const overlayEl = document.createElement("div");
    const state = makeState({
      me: "player-99",
      seasonWinner: makeWinner({ playerId: "player-99", playerName: "Anon" }),
      leaderboard: {
        overall: [],
        selfOverall: undefined,
        selfByTiles: undefined,
        selfByIncome: undefined,
        selfByTechs: undefined,
        byTiles: [],
        byIncome: [],
        byTechs: []
      }
    });
    renderSeasonEndOverlay({ state: state as any, overlayEl, renderHud: () => {}, startNewSeason: () => {} });
    expect(overlayEl.innerHTML).toContain("You");
  });
});
