import { describe, expect, it } from "vitest";
import { EXPAND_MANPOWER_COST } from "@border-empires/shared";

import { planAutomationCommand } from "./automation-command-planner.js";
import type { WorldVictoryProgress } from "./victory-path-scoring.js";

const town = { x: 0, y: 0, terrain: "LAND" as const, ownerId: "ai-1", ownershipState: "SETTLED", town: { name: "Core", type: "MARKET" as const, populationTier: "TOWN" as const, supportMax: 0, supportCurrent: 0 } };
const frontier = { x: 1, y: 0, terrain: "LAND" as const, ownerId: "ai-1", ownershipState: "FRONTIER" };

const plan = (worldVictoryProgress?: WorldVictoryProgress) => {
  let plannedPath: string | undefined;
  const result = planAutomationCommand({
    playerId: "ai-1",
    points: 80,
    manpower: EXPAND_MANPOWER_COST,
    settledTileCount: 5,
    townCount: 1,
    incomePerMinute: 7,
    hasActiveLock: false,
    activeDevelopmentProcessCount: 0,
    frontierTiles: [frontier],
    ownedTiles: [town, frontier],
    tilesByKey: new Map([["0,0", town], ["1,0", frontier]]),
    previousVictoryPath: "DIPLOMATIC_DOMINANCE",
    ...(worldVictoryProgress ? { worldVictoryProgress } : {}),
    onStrategicSnapshot: (snapshot) => {
      plannedPath = snapshot.primaryVictoryPath;
    },
    clientSeq: 1,
    issuedAt: 1000,
    sessionPrefix: "ai-runtime"
  });
  return { plannedPath, victoryPath: result.diagnostic.victoryPath };
};

describe("planAutomationCommand victory standings", () => {
  it("reports heuristic path scoring when no standings are supplied", () => {
    expect(plan().victoryPath?.source).toBe("heuristic");
  });

  it("steers path choice by real standings and reports them in the diagnostic", () => {
    const { plannedPath, victoryPath } = plan({ DIPLOMATIC_DOMINANCE: 0.02, ECONOMIC_HEGEMONY: 0.55 });
    expect(plannedPath).toBe("ECONOMIC_HEGEMONY");
    expect(victoryPath).toEqual({ path: "ECONOMIC_HEGEMONY", progress: 0.55, source: "world" });
  });
});
