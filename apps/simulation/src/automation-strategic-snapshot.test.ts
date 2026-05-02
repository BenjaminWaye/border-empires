import { describe, expect, it } from "vitest";

import { buildAutomationStrategicSnapshot } from "./automation-strategic-snapshot.js";

const makeTile = (
  x: number,
  y: number,
  overrides: Partial<{
    terrain: "LAND" | "SEA" | "MOUNTAIN";
    ownerId: string;
    ownershipState: string;
    dockId: string;
    town: { name?: string } | null;
  }> = {}
) => ({
  x,
  y,
  terrain: "LAND" as const,
  ...overrides
});

describe("automation strategic snapshot", () => {
  it("chooses settled-territory island focus for dock-cross growth positions", () => {
    const ownedDock = makeTile(10, 10, { ownerId: "ai-1", ownershipState: "SETTLED", dockId: "dock-a" });
    const remoteDock = makeTile(50, 50, { dockId: "dock-b" });
    const snapshot = buildAutomationStrategicSnapshot({
      playerId: "ai-1",
      points: 500,
      manpower: 10,
      settledTileCount: 4,
      townCount: 1,
      incomePerMinute: 9,
      ownedTiles: [ownedDock],
      tilesByKey: new Map([
        ["10,10", ownedDock],
        ["50,50", remoteDock]
      ]),
      frontierAnalysis: {
        expand: {
          from: ownedDock,
          target: remoteDock,
          score: 240
        },
        frontierEnemyTargetCount: 0,
        frontierNeutralTargetCount: 1,
        frontierOpportunityEconomic: 0,
        frontierOpportunityScout: 0,
        frontierOpportunityScaffold: 0,
        frontierOpportunityWaste: 0
      },
      needsFood: false,
      needsEconomy: false,
      canAttack: true,
      canExpand: true,
      economicBuildAvailable: false,
      fortBuildAvailable: false,
      siegeOutpostBuildAvailable: false
    });

    expect(snapshot.primaryVictoryPath).toBe("SETTLED_TERRITORY");
    expect(snapshot.strategicFocus).toBe("ISLAND_FOOTPRINT");
    expect(snapshot.islandExpandAvailable).toBe(true);
  });

  it("chooses break posture and town-control pressure when healthy towns face enemy border pressure", () => {
    const town = makeTile(0, 0, { ownerId: "ai-1", ownershipState: "SETTLED", town: { name: "Core" } });
    const enemy = makeTile(1, 0, { ownerId: "enemy-1" });
    const snapshot = buildAutomationStrategicSnapshot({
      playerId: "ai-1",
      points: 800,
      manpower: 12,
      settledTileCount: 5,
      townCount: 2,
      incomePerMinute: 10,
      ownedTiles: [town],
      tilesByKey: new Map([
        ["0,0", town],
        ["1,0", enemy]
      ]),
      frontierAnalysis: {
        attack: {
          from: town,
          target: enemy,
          score: 210
        },
        frontierEnemyTargetCount: 2,
        frontierNeutralTargetCount: 0,
        frontierOpportunityEconomic: 0,
        frontierOpportunityScout: 0,
        frontierOpportunityScaffold: 0,
        frontierOpportunityWaste: 0
      },
      needsFood: false,
      needsEconomy: false,
      canAttack: true,
      canExpand: true,
      economicBuildAvailable: false,
      fortBuildAvailable: true,
      siegeOutpostBuildAvailable: true
    });

    expect(snapshot.primaryVictoryPath).toBe("TOWN_CONTROL");
    expect(snapshot.frontPosture).toBe("BREAK");
    expect(snapshot.attackReady).toBe(true);
  });

  it("retains the previous victory path when it is still a contender", () => {
    const town = makeTile(0, 0, { ownerId: "ai-1", ownershipState: "SETTLED", town: { name: "Core" } });
    const enemy = makeTile(1, 0, { ownerId: "enemy-1" });
    const neutral = makeTile(0, 1, {});
    const snapshot = buildAutomationStrategicSnapshot({
      playerId: "ai-1",
      points: 800,
      manpower: 12,
      settledTileCount: 5,
      townCount: 1,
      incomePerMinute: 7,
      ownedTiles: [town],
      tilesByKey: new Map([
        ["0,0", town],
        ["1,0", enemy],
        ["0,1", neutral]
      ]),
      frontierAnalysis: {
        attack: {
          from: town,
          target: enemy,
          score: 110
        },
        expand: {
          from: town,
          target: neutral,
          score: 140
        },
        frontierEnemyTargetCount: 1,
        frontierNeutralTargetCount: 1,
        frontierOpportunityEconomic: 0,
        frontierOpportunityScout: 0,
        frontierOpportunityScaffold: 0,
        frontierOpportunityWaste: 0
      },
      needsFood: false,
      needsEconomy: false,
      canAttack: true,
      canExpand: true,
      economicBuildAvailable: false,
      fortBuildAvailable: true,
      siegeOutpostBuildAvailable: false,
      previousVictoryPath: "ECONOMIC_HEGEMONY"
    });

    expect(snapshot.primaryVictoryPath).not.toBe("TOWN_CONTROL");
  });

  it("uses contain posture for light enemy pressure when growth options remain", () => {
    const town = makeTile(0, 0, { ownerId: "ai-1", ownershipState: "SETTLED", town: { name: "Core" } });
    const enemy = makeTile(1, 0, { ownerId: "enemy-1" });
    const neutral = makeTile(0, 1, {});
    const snapshot = buildAutomationStrategicSnapshot({
      playerId: "ai-1",
      points: 800,
      manpower: 12,
      settledTileCount: 5,
      townCount: 1,
      incomePerMinute: 9,
      ownedTiles: [town],
      tilesByKey: new Map([
        ["0,0", town],
        ["1,0", enemy],
        ["0,1", neutral]
      ]),
      frontierAnalysis: {
        attack: {
          from: town,
          target: enemy,
          score: 110
        },
        expand: {
          from: town,
          target: neutral,
          score: 140
        },
        frontierEnemyTargetCount: 1,
        frontierNeutralTargetCount: 1,
        frontierOpportunityEconomic: 1,
        frontierOpportunityScout: 0,
        frontierOpportunityScaffold: 0,
        frontierOpportunityWaste: 0
      },
      needsFood: false,
      needsEconomy: false,
      canAttack: true,
      canExpand: true,
      economicBuildAvailable: true,
      fortBuildAvailable: true,
      siegeOutpostBuildAvailable: false,
      previousVictoryPath: "SETTLED_TERRITORY"
    });

    expect(snapshot.pressureThreatensCore).toBe(false);
    expect(snapshot.frontPosture).toBe("CONTAIN");
  });

  it("penalizes overcrowded victory paths so similar AIs diversify", () => {
    const town = makeTile(0, 0, { ownerId: "ai-1", ownershipState: "SETTLED", town: { name: "Core" } });
    const enemy = makeTile(1, 0, { ownerId: "enemy-1" });
    const snapshot = buildAutomationStrategicSnapshot({
      playerId: "ai-1",
      points: 800,
      manpower: 12,
      settledTileCount: 15,
      townCount: 2,
      incomePerMinute: 10,
      ownedTiles: [town],
      tilesByKey: new Map([
        ["0,0", town],
        ["1,0", enemy]
      ]),
      frontierAnalysis: {
        attack: {
          from: town,
          target: enemy,
          score: 100
        },
        frontierEnemyTargetCount: 1,
        frontierNeutralTargetCount: 0,
        frontierOpportunityEconomic: 1,
        frontierOpportunityScout: 0,
        frontierOpportunityScaffold: 0,
        frontierOpportunityWaste: 0
      },
      needsFood: false,
      needsEconomy: false,
      canAttack: true,
      canExpand: true,
      economicBuildAvailable: false,
      fortBuildAvailable: false,
      siegeOutpostBuildAvailable: false,
      pathPopulationCounts: {
        TOWN_CONTROL: 6,
        ECONOMIC_HEGEMONY: 0,
        SETTLED_TERRITORY: 0
      }
    });

    expect(snapshot.primaryVictoryPath).not.toBe("TOWN_CONTROL");
  });

  it("marks opening scout only for fragile no-town starts", () => {
    const settled = makeTile(20, 19, { ownerId: "ai-1", ownershipState: "SETTLED" });
    const frontier = makeTile(20, 20, { ownerId: "ai-1", ownershipState: "FRONTIER" });
    const scout = makeTile(21, 20, {});
    const snapshot = buildAutomationStrategicSnapshot({
      playerId: "ai-1",
      points: 500,
      manpower: 10,
      settledTileCount: 1,
      townCount: 0,
      incomePerMinute: 2,
      ownedTiles: [settled, frontier],
      tilesByKey: new Map([
        ["20,19", settled],
        ["20,20", frontier],
        ["21,20", scout]
      ]),
      frontierAnalysis: {
        scoutExpand: {
          from: frontier,
          target: scout,
          score: 180
        },
        frontierEnemyTargetCount: 0,
        frontierNeutralTargetCount: 1,
        frontierOpportunityEconomic: 0,
        frontierOpportunityScout: 1,
        frontierOpportunityScaffold: 0,
        frontierOpportunityWaste: 1
      },
      needsFood: false,
      needsEconomy: false,
      canAttack: true,
      canExpand: true,
      economicBuildAvailable: false,
      fortBuildAvailable: false,
      siegeOutpostBuildAvailable: false
    });

    expect(snapshot.openingScoutAvailable).toBe(true);
    expect(snapshot.scoutExpandWorthwhile).toBe(true);
  });
});
