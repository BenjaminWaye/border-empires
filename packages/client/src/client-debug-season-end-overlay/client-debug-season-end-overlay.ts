import type { ClientState } from "../client-state/client-state.js";
import type { LeaderboardOverallEntry, SeasonVictoryObjectiveView, SeasonWinnerView } from "../client-types.js";

// Debug: force the season-end overlay visible from the browser console.
// Usage: __debugSeasonEndOverlay()
// Extracted out of client-bootstrap.ts (which just wires this in) so that
// file doesn't keep growing past the repo's 500-line-file-growth limit.
export const installDebugSeasonEndOverlay = (state: ClientState, renderHud: () => void): void => {
  (window as unknown as Record<string, unknown>).__debugSeasonEndOverlay = () => {
    const winner: SeasonWinnerView = {
      playerId: "player-1",
      playerName: "Debug Winner",
      crownedAt: Date.now(),
      objectiveId: "TOWN_CONTROL",
      objectiveName: "Debug Win"
    };
    const victory: SeasonVictoryObjectiveView[] = [
      {
        id: "TOWN_CONTROL",
        name: "Town Control",
        description: "Hold 50% of towns.",
        leaderPlayerId: "player-1",
        leaderName: "Debug Winner",
        progressLabel: "20/87 towns",
        thresholdLabel: "Need 87 towns",
        holdDurationSeconds: 86400,
        statusLabel: "Pressure building",
        conditionMet: false,
        selfProgressLabel: "12/87 towns"
      },
      {
        id: "ECONOMIC_HEGEMONY",
        name: "Economic Dominance",
        description: "Reach 500 gold/min income.",
        leaderPlayerId: "player-2",
        leaderName: "Rival",
        progressLabel: "420/min",
        thresholdLabel: "500/min",
        holdDurationSeconds: 86400,
        statusLabel: "Challenging",
        conditionMet: false,
        selfProgressLabel: "180/min"
      }
    ];
    const lbOverall: LeaderboardOverallEntry[] = [
      { id: "p1", rank: 1, name: "Alpha", score: 9450.5, tiles: 87, incomePerMinute: 420, techs: 24 },
      { id: "p2", rank: 2, name: "Beta", score: 8120.3, tiles: 64, incomePerMinute: 380, techs: 21 },
      { id: "p3", rank: 3, name: "Gamma", score: 6700.1, tiles: 55, incomePerMinute: 310, techs: 18 },
      { id: "p4", rank: 4, name: "Delta", score: 5230, tiles: 48, incomePerMinute: 260, techs: 15 },
      { id: "p5", rank: 5, name: "Epsilon", score: 4100, tiles: 42, incomePerMinute: 220, techs: 13 }
    ];
    state.seasonWinner = winner;
    state.seasonEndDismissed = false;
    state.seasonVictory = victory;
    state.leaderboard = {
      overall: lbOverall,
      selfOverall: { id: "player-1", rank: 6, name: "Debug Winner", score: 3200, tiles: 35, incomePerMinute: 180, techs: 10 },
      selfByTiles: undefined,
      selfByIncome: undefined,
      selfByTechs: undefined,
      byTiles: [],
      byIncome: [],
      byTechs: []
    };
    state.playerColors = new Map([
      ["p1", "#e74c3c"],
      ["p2", "#3498db"],
      ["p3", "#2ecc71"],
      ["p4", "#f39c12"],
      ["p5", "#9b59b6"],
      ["player-1", "#1abc9c"]
    ]);
    renderHud();
  };
};
