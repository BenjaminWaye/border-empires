import { describe, expect, it } from "vitest";

import { chooseVictoryPath, scoreVictoryPaths, type VictoryPathScoringInput, type StrategicTile } from "./victory-path-scoring.js";

const frontierAnalysis: VictoryPathScoringInput<StrategicTile>["frontierAnalysis"] = {
  frontierEnemyTargetCount: 0,
  frontierNeutralTargetCount: 0,
  frontierOpportunityEconomic: 0,
  frontierOpportunityTownSupport: 0,
  frontierOpportunityScout: 0,
  frontierOpportunityScaffold: 0,
  frontierOpportunityWaste: 0
};

// Shaped like prod ai-1 on 2026-10-27: 6,131 tiles, 573 settled, 64.5/min,
// yet nowhere near any real win condition.
const prodShapedInput = (overrides: Partial<VictoryPathScoringInput<StrategicTile>> = {}): VictoryPathScoringInput<StrategicTile> => ({
  playerId: "ai-1",
  settledTileCount: 573,
  controlledTileCount: 6_131,
  townCount: 40,
  incomePerMinute: 64.5,
  ownedTiles: [],
  frontierAnalysis,
  needsFood: false,
  needsEconomy: false,
  economicBuildAvailable: false,
  ...overrides
});

describe("scoreVictoryPaths", () => {
  it("heuristic fallback reads a mid-sized empire as already winning (why world standings are needed)", () => {
    const scores = scoreVictoryPaths(prodShapedInput());
    expect(scores.DIPLOMATIC_DOMINANCE.progress).toBeGreaterThan(1);
    expect(scores.ECONOMIC_HEGEMONY.progress).toBeGreaterThan(1);
  });

  it("uses real world progress when standings are present", () => {
    const scores = scoreVictoryPaths(prodShapedInput({
      worldVictoryProgress: { TOWN_CONTROL: 0.2, ECONOMIC_HEGEMONY: 0.9, DIPLOMATIC_DOMINANCE: 0.05 }
    }));
    expect(scores.DIPLOMATIC_DOMINANCE.progress).toBe(0.05);
    expect(scores.DIPLOMATIC_DOMINANCE.contender).toBe(false);
    expect(scores.ECONOMIC_HEGEMONY.contender).toBe(true);
    expect(scores.RESOURCE_MONOPOLY.progress).toBe(0);
    expect(scores.ECONOMIC_HEGEMONY.score).toBeGreaterThan(scores.TOWN_CONTROL.score);
  });

  it("clamps out-of-range standings to 0..1", () => {
    const scores = scoreVictoryPaths(prodShapedInput({ worldVictoryProgress: { TOWN_CONTROL: 3, MARITIME_SUPREMACY: -1 } }));
    expect(scores.TOWN_CONTROL.progress).toBe(1);
    expect(scores.MARITIME_SUPREMACY.progress).toBe(0);
  });
});

describe("chooseVictoryPath", () => {
  it("picks the path the AI is actually closest to winning", () => {
    const choice = chooseVictoryPath(prodShapedInput({
      worldVictoryProgress: { TOWN_CONTROL: 0.1, ECONOMIC_HEGEMONY: 0.6, DIPLOMATIC_DOMINANCE: 0.05 }
    }));
    expect(choice).toEqual({ path: "ECONOMIC_HEGEMONY", progress: 0.6 });
  });

  it("no longer stays locked on a path it only 'leads' by the heuristic", () => {
    const input = prodShapedInput({ previousVictoryPath: "DIPLOMATIC_DOMINANCE" });
    expect(chooseVictoryPath(input).path).toBe("DIPLOMATIC_DOMINANCE");
    const withStandings = chooseVictoryPath({ ...input, worldVictoryProgress: { DIPLOMATIC_DOMINANCE: 0.05, ECONOMIC_HEGEMONY: 0.5 } });
    expect(withStandings).toEqual({ path: "ECONOMIC_HEGEMONY", progress: 0.5 });
  });

  it("holds a path where it is a real contender even when another scores higher", () => {
    const choice = chooseVictoryPath(prodShapedInput({
      previousVictoryPath: "TOWN_CONTROL",
      worldVictoryProgress: { TOWN_CONTROL: 0.75, ECONOMIC_HEGEMONY: 0.95 }
    }));
    expect(choice.path).toBe("TOWN_CONTROL");
  });

  it("leaves a contending path to defend another path whose win condition is already met", () => {
    const choice = chooseVictoryPath(prodShapedInput({
      previousVictoryPath: "TOWN_CONTROL",
      worldVictoryProgress: { TOWN_CONTROL: 0.75, ECONOMIC_HEGEMONY: 1 }
    }));
    expect(choice).toEqual({ path: "ECONOMIC_HEGEMONY", progress: 1 });
  });

  it("breaks near-zero season-start ties by the situational heuristic, not path order", () => {
    // Heuristic strongly favours economy here (high income, economic build ready).
    const choice = chooseVictoryPath(prodShapedInput({ economicBuildAvailable: true, worldVictoryProgress: {} }));
    const heuristicBest = Object.entries(scoreVictoryPaths(prodShapedInput({ economicBuildAvailable: true })))
      .sort((left, right) => right[1].score - left[1].score)[0]![0];
    expect(choice.path).toBe(heuristicBest);
  });

  it("never lets the heuristic alone flip a held path", () => {
    const choice = chooseVictoryPath(prodShapedInput({ previousVictoryPath: "MARITIME_SUPREMACY", worldVictoryProgress: {} }));
    expect(choice.path).toBe("MARITIME_SUPREMACY");
  });

  it("keeps the previous path inside the repivot margin", () => {
    const choice = chooseVictoryPath(prodShapedInput({
      previousVictoryPath: "TOWN_CONTROL",
      worldVictoryProgress: { TOWN_CONTROL: 0.3, ECONOMIC_HEGEMONY: 0.305 }
    }));
    expect(choice.path).toBe("TOWN_CONTROL");
  });
});
