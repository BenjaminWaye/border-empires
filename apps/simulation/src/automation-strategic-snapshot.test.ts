import { describe, expect, it } from "vitest";
import { ATTACK_MANPOWER_MIN } from "@border-empires/shared";

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
  it("chooses territorial-control island focus for dock-cross growth positions", () => {
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
        frontierOpportunityTownSupport: 0,
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

  it("treats frontier holdings as territorial-control progress", () => {
    const town = makeTile(0, 0, { ownerId: "ai-1", ownershipState: "SETTLED", town: { name: "Core" } });
    const frontierTiles = Array.from({ length: 5 }, (_, index) =>
      makeTile(index + 1, 0, { ownerId: "ai-1", ownershipState: "FRONTIER" })
    );
    const neutral = makeTile(7, 0, {});
    const snapshot = buildAutomationStrategicSnapshot({
      playerId: "ai-1",
      points: 500,
      manpower: 10,
      settledTileCount: 1,
      townCount: 1,
      incomePerMinute: 10,
      ownedTiles: [town, ...frontierTiles],
      tilesByKey: new Map([
        ["0,0", town],
        ...frontierTiles.map((tile) => [`${tile.x},${tile.y}`, tile] as const),
        ["7,0", neutral]
      ]),
      frontierAnalysis: {
        expand: {
          from: frontierTiles[4],
          target: neutral,
          score: 160
        },
        frontierEnemyTargetCount: 0,
        frontierNeutralTargetCount: 1,
        frontierOpportunityEconomic: 0,
        frontierOpportunityTownSupport: 0,
        frontierOpportunityScout: 1,
        frontierOpportunityScaffold: 1,
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
    expect(snapshot.victoryPathContender).toBe(true);
  });

  it("chooses break posture and town-control pressure when healthy towns face enemy border pressure", () => {
    const town = makeTile(0, 0, { ownerId: "ai-1", ownershipState: "SETTLED", town: { name: "Core" } });
    const enemy = makeTile(1, 0, { ownerId: "enemy-1" });
    const snapshot = buildAutomationStrategicSnapshot({
      playerId: "ai-1",
      points: 800,
      manpower: ATTACK_MANPOWER_MIN + 20,
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
        frontierOpportunityTownSupport: 0,
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
        frontierOpportunityTownSupport: 0,
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
        frontierOpportunityTownSupport: 0,
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
        frontierOpportunityTownSupport: 0,
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
        frontierOpportunityTownSupport: 0,
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

  it("selects RESOURCE_MONOPOLY when AI has stacked the same resource type", () => {
    const ironTiles = Array.from({ length: 7 }, (_, index) =>
      makeTile(index, 0, { ownerId: "ai-1", ownershipState: "SETTLED" })
    ).map((tile) => ({ ...tile, resource: "IRON" as const }));
    const tilesByKey = new Map(ironTiles.map((tile) => [`${tile.x},${tile.y}`, tile]));
    const snapshot = buildAutomationStrategicSnapshot({
      playerId: "ai-1",
      points: 800,
      manpower: 12,
      settledTileCount: 7,
      townCount: 1,
      incomePerMinute: 11,
      ownedTiles: ironTiles,
      tilesByKey,
      frontierAnalysis: {
        frontierEnemyTargetCount: 0,
        frontierNeutralTargetCount: 1,
        frontierOpportunityEconomic: 1,
        frontierOpportunityTownSupport: 0,
        frontierOpportunityScout: 0,
        frontierOpportunityScaffold: 0,
        frontierOpportunityWaste: 0
      },
      needsFood: false,
      needsEconomy: false,
      canAttack: true,
      canExpand: true,
      economicBuildAvailable: true,
      fortBuildAvailable: false,
      siegeOutpostBuildAvailable: false
    });

    expect(snapshot.primaryVictoryPath).toBe("RESOURCE_MONOPOLY");
  });

  it("selects CONTINENT_FOOTPRINT when AI has multiple docks and dock-cross expansion is reachable", () => {
    const dockA = makeTile(0, 0, { ownerId: "ai-1", ownershipState: "SETTLED", dockId: "dock-a" });
    const dockB = makeTile(20, 0, { ownerId: "ai-1", ownershipState: "SETTLED", dockId: "dock-b" });
    const remoteDock = makeTile(50, 50, { dockId: "dock-c" });
    const snapshot = buildAutomationStrategicSnapshot({
      playerId: "ai-1",
      points: 800,
      manpower: 12,
      settledTileCount: 4,
      townCount: 1,
      incomePerMinute: 9,
      ownedTiles: [dockA, dockB],
      tilesByKey: new Map([
        ["0,0", dockA],
        ["20,0", dockB],
        ["50,50", remoteDock]
      ]),
      frontierAnalysis: {
        expand: { from: dockA, target: remoteDock, score: 240 },
        frontierEnemyTargetCount: 0,
        frontierNeutralTargetCount: 1,
        frontierOpportunityEconomic: 0,
        frontierOpportunityTownSupport: 0,
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

    expect(snapshot.primaryVictoryPath).toBe("CONTINENT_FOOTPRINT");
    expect(snapshot.islandExpandAvailable).toBe(true);
  });

  it("requires +15 manpower over base for one-town AI without enemy pressure", () => {
    // townCount<=1 tier, no enemies → not underThreat → threshold = ATTACK_MANPOWER_MIN + 15.
    const town = makeTile(0, 0, { ownerId: "ai-1", ownershipState: "SETTLED", town: { name: "Solo" } });
    const baseInput = {
      playerId: "ai-1",
      points: 800,
      settledTileCount: 3,
      townCount: 1,
      incomePerMinute: 6,
      ownedTiles: [town],
      tilesByKey: new Map([["0,0", town]]),
      frontierAnalysis: {
        frontierEnemyTargetCount: 0,
        frontierNeutralTargetCount: 1,
        frontierOpportunityEconomic: 0,
        frontierOpportunityTownSupport: 0,
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
    } as const;
    const tooLow = buildAutomationStrategicSnapshot({ ...baseInput, manpower: ATTACK_MANPOWER_MIN + 14 });
    const sufficient = buildAutomationStrategicSnapshot({ ...baseInput, manpower: ATTACK_MANPOWER_MIN + 15 });

    expect(tooLow.underThreat).toBe(false);
    expect(tooLow.manpowerSufficient).toBe(false);
    expect(sufficient.manpowerSufficient).toBe(true);
  });

  it("requires only +5 manpower when underThreat (frontier enemies + needsEconomy)", () => {
    // underThreat tier → threshold = ATTACK_MANPOWER_MIN + 5.
    const town = makeTile(0, 0, { ownerId: "ai-1", ownershipState: "SETTLED", town: { name: "Core" } });
    const enemy = makeTile(1, 0, { ownerId: "enemy-1" });
    const snapshot = buildAutomationStrategicSnapshot({
      playerId: "ai-1",
      points: 800,
      manpower: ATTACK_MANPOWER_MIN + 5,
      settledTileCount: 5,
      townCount: 2,
      incomePerMinute: 1,
      ownedTiles: [town],
      tilesByKey: new Map([
        ["0,0", town],
        ["1,0", enemy]
      ]),
      frontierAnalysis: {
        attack: { from: town, target: enemy, score: 100 },
        frontierEnemyTargetCount: 1,
        frontierNeutralTargetCount: 0,
        frontierOpportunityEconomic: 0,
        frontierOpportunityTownSupport: 0,
        frontierOpportunityScout: 0,
        frontierOpportunityScaffold: 0,
        frontierOpportunityWaste: 0
      },
      needsFood: false,
      needsEconomy: true,
      canAttack: true,
      canExpand: true,
      economicBuildAvailable: false,
      fortBuildAvailable: false,
      siegeOutpostBuildAvailable: false
    });

    expect(snapshot.underThreat).toBe(true);
    expect(snapshot.threatCritical).toBe(false);
    expect(snapshot.manpowerSufficient).toBe(true);
  });

  it("relaxes the manpower gate to ATTACK_MIN when threat is critical", () => {
    // threatCritical → require exactly ATTACK_MANPOWER_MIN. Gambling allowed when desperate.
    const town = makeTile(0, 0, { ownerId: "ai-1", ownershipState: "SETTLED", town: { name: "Core" } });
    const enemyA = makeTile(1, 0, { ownerId: "enemy-1" });
    const enemyB = makeTile(0, 1, { ownerId: "enemy-2" });
    const snapshot = buildAutomationStrategicSnapshot({
      playerId: "ai-1",
      points: 800,
      manpower: ATTACK_MANPOWER_MIN,
      settledTileCount: 5,
      townCount: 2,
      incomePerMinute: 1,
      ownedTiles: [town],
      tilesByKey: new Map([
        ["0,0", town],
        ["1,0", enemyA],
        ["0,1", enemyB]
      ]),
      frontierAnalysis: {
        attack: { from: town, target: enemyA, score: 360 },
        frontierEnemyTargetCount: 2,
        frontierNeutralTargetCount: 0,
        frontierOpportunityEconomic: 0,
        frontierOpportunityTownSupport: 0,
        frontierOpportunityScout: 0,
        frontierOpportunityScaffold: 0,
        frontierOpportunityWaste: 0
      },
      needsFood: true,
      needsEconomy: true,
      canAttack: true,
      canExpand: true,
      economicBuildAvailable: false,
      fortBuildAvailable: false,
      siegeOutpostBuildAvailable: false
    });

    expect(snapshot.threatCritical).toBe(true);
    expect(snapshot.manpowerSufficient).toBe(true);
  });

  it("requires +10 manpower over base for the default tier (multi-town, healthy economy, no threat)", () => {
    // Default tier (not threatCritical, not underThreat, not needsEconomy, townCount>1)
    // → threshold = ATTACK_MANPOWER_MIN + 10.
    const town = makeTile(0, 0, { ownerId: "ai-1", ownershipState: "SETTLED", town: { name: "Core" } });
    const otherTown = makeTile(2, 0, { ownerId: "ai-1", ownershipState: "SETTLED", town: { name: "Outpost" } });
    const baseInput = {
      playerId: "ai-1",
      points: 800,
      settledTileCount: 8,
      townCount: 2,
      incomePerMinute: 12,
      ownedTiles: [town, otherTown],
      tilesByKey: new Map([
        ["0,0", town],
        ["2,0", otherTown]
      ]),
      frontierAnalysis: {
        frontierEnemyTargetCount: 0,
        frontierNeutralTargetCount: 1,
        frontierOpportunityEconomic: 0,
        frontierOpportunityTownSupport: 0,
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
    } as const;
    const tooLow = buildAutomationStrategicSnapshot({ ...baseInput, manpower: ATTACK_MANPOWER_MIN + 9 });
    const sufficient = buildAutomationStrategicSnapshot({ ...baseInput, manpower: ATTACK_MANPOWER_MIN + 10 });

    expect(tooLow.underThreat).toBe(false);
    expect(tooLow.threatCritical).toBe(false);
    expect(tooLow.manpowerSufficient).toBe(false);
    expect(sufficient.manpowerSufficient).toBe(true);
  });
});
