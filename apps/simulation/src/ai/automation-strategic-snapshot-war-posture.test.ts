import { describe, expect, it } from "vitest";

import { buildAutomationStrategicSnapshot } from "./automation-strategic-snapshot.js";

const makeTile = (
  x: number,
  y: number,
  overrides: Partial<{ terrain: "LAND" | "SEA" | "MOUNTAIN"; ownerId: string; dockId: string }> = {}
) => ({ x, y, terrain: "LAND" as const, ...overrides });

const owned = makeTile(5, 5, { ownerId: "ai-1" });

// Serious, core-threatening pressure (needsEconomy strains growth) plus a
// real barbarian target one tile away — land-connected, not dock-crossing.
const barbarianNextDoor = makeTile(6, 5, { ownerId: "barbarian-1" });

const baseInput = {
  playerId: "ai-1",
  points: 500,
  manpower: 100,
  settledTileCount: 4,
  controlledTileCount: 4,
  townCount: 1,
  incomePerMinute: 5 / 288,
  ownedTiles: [owned],
  tilesByKey: new Map([
    ["5,5", owned],
    ["6,5", barbarianNextDoor]
  ]),
  canAttack: true,
  canExpand: true,
  economicBuildAvailable: false,
  fortBuildAvailable: false,
  siegeOutpostBuildAvailable: false
};

describe("WAR front posture", () => {
  it("latches WAR when pressureThreatensCore holds and the threat is land-connected", () => {
    const snapshot = buildAutomationStrategicSnapshot({
      ...baseInput,
      needsFood: false,
      needsEconomy: true, // strainedGrowth -> pressureThreatensCore, given a real target
      frontierAnalysis: {
        barbarianAttack: { from: owned, target: barbarianNextDoor, score: 50 },
        frontierEnemyTargetCount: 1,
        frontierNeutralTargetCount: 0,
        frontierOpportunityEconomic: 0,
        frontierOpportunityTownSupport: 0,
        frontierOpportunityScout: 0,
        frontierOpportunityScaffold: 0,
        frontierOpportunityWaste: 0
      }
    });

    expect(snapshot.pressureThreatensCore).toBe(true);
    expect(snapshot.frontPosture).toBe("WAR");
    expect(snapshot.warPostureLatch).toEqual({ active: true, clearTicks: 0 });
  });

  it("does not latch WAR for a dock-crossing (ocean-separated) threat, even under real pressure", () => {
    const remoteDock = makeTile(50, 50, { ownerId: "barbarian-1", dockId: "dock-b" });
    const ownedDock = makeTile(5, 5, { ownerId: "ai-1", dockId: "dock-a" });
    const snapshot = buildAutomationStrategicSnapshot({
      ...baseInput,
      ownedTiles: [ownedDock],
      tilesByKey: new Map([
        ["5,5", ownedDock],
        ["50,50", remoteDock]
      ]),
      needsFood: false,
      needsEconomy: true,
      frontierAnalysis: {
        barbarianAttack: { from: ownedDock, target: remoteDock, score: 50 },
        frontierEnemyTargetCount: 1,
        frontierNeutralTargetCount: 0,
        frontierOpportunityEconomic: 0,
        frontierOpportunityTownSupport: 0,
        frontierOpportunityScout: 0,
        frontierOpportunityScaffold: 0,
        frontierOpportunityWaste: 0
      }
    });

    expect(snapshot.pressureThreatensCore).toBe(true);
    expect(snapshot.frontPosture).not.toBe("WAR");
    expect(snapshot.warPostureLatch.active).toBe(false);
  });

  it("does not latch WAR from ordinary border contact that doesn't clear pressureThreatensCore", () => {
    // A real land-connected enemy exists, but nothing strains growth and the
    // count is too low to threaten the core on its own — the exact "claims
    // town-support ring tiles before generic pressure" scenario.
    const enemy = makeTile(6, 5, { ownerId: "enemy-1" });
    const snapshot = buildAutomationStrategicSnapshot({
      ...baseInput,
      tilesByKey: new Map([
        ["5,5", owned],
        ["6,5", enemy]
      ]),
      needsFood: false,
      needsEconomy: false,
      frontierAnalysis: {
        enemyAttack: { from: owned, target: enemy, score: 50 },
        frontierEnemyTargetCount: 1,
        frontierNeutralTargetCount: 3,
        frontierOpportunityEconomic: 1,
        frontierOpportunityTownSupport: 0,
        frontierOpportunityScout: 0,
        frontierOpportunityScaffold: 0,
        frontierOpportunityWaste: 0
      }
    });

    expect(snapshot.pressureThreatensCore).toBe(false);
    expect(snapshot.frontPosture).not.toBe("WAR");
  });

  it("carries the latch forward across calls via previousWarPostureLatch, honoring the exit hysteresis", () => {
    const firstTick = buildAutomationStrategicSnapshot({
      ...baseInput,
      needsFood: false,
      needsEconomy: true,
      frontierAnalysis: {
        barbarianAttack: { from: owned, target: barbarianNextDoor, score: 50 },
        frontierEnemyTargetCount: 1,
        frontierNeutralTargetCount: 0,
        frontierOpportunityEconomic: 0,
        frontierOpportunityTownSupport: 0,
        frontierOpportunityScout: 0,
        frontierOpportunityScaffold: 0,
        frontierOpportunityWaste: 0
      }
    });
    expect(firstTick.frontPosture).toBe("WAR");

    // Threat is gone this tick, but the latch should still hold (hysteresis).
    const secondTick = buildAutomationStrategicSnapshot({
      ...baseInput,
      needsFood: false,
      needsEconomy: false,
      previousWarPostureLatch: firstTick.warPostureLatch,
      frontierAnalysis: {
        frontierEnemyTargetCount: 0,
        frontierNeutralTargetCount: 0,
        frontierOpportunityEconomic: 0,
        frontierOpportunityTownSupport: 0,
        frontierOpportunityScout: 0,
        frontierOpportunityScaffold: 0,
        frontierOpportunityWaste: 0
      }
    });
    expect(secondTick.frontPosture).toBe("WAR");
    expect(secondTick.warPostureLatch.clearTicks).toBe(1);
  });
});
