import { describe, expect, it } from "vitest";

import { buildDockLinksByDockTileKey } from "../dock-network/dock-network.js";
import { planAutomationCommand } from "./automation-command-planner.js";

const makeTile = (
  x: number,
  y: number,
  overrides: Partial<{
    terrain: "LAND" | "SEA" | "MOUNTAIN";
    ownerId: string;
    ownershipState: string;
    resource: string;
    dockId: string;
    town: {
      supportMax?: number;
      supportCurrent?: number;
      type?: "MARKET" | "FARMING";
      name?: string;
      populationTier?: "SETTLEMENT" | "TOWN" | "CITY" | "GREAT_CITY" | "METROPOLIS";
    } | null;
  }> = {}
) => ({
  x,
  y,
  terrain: "LAND" as const,
  ...overrides
});

describe("automation command planner strategic parity", () => {
  it("prefers dock-cross island expansion over local scout churn on diplomatic-dominance paths", () => {
    const ownedDock = makeTile(10, 10, { ownerId: "ai-1", ownershipState: "SETTLED", dockId: "dock-a" });
    const localFrontier = makeTile(11, 10, { ownerId: "ai-1", ownershipState: "FRONTIER" });
    const remoteDock = makeTile(50, 50, { dockId: "dock-b" });
    const localScout = makeTile(12, 10, {});
    const dockLinksByDockTileKey = buildDockLinksByDockTileKey([
      { dockId: "dock-a", tileKey: "10,10", pairedDockId: "dock-b", connectedDockIds: ["dock-b"] },
      { dockId: "dock-b", tileKey: "50,50", pairedDockId: "dock-a", connectedDockIds: ["dock-a"] }
    ]);

    let snapshotDebug: { primaryVictoryPath: string; frontPosture: string; attackReady: boolean; scoutExpandWorthwhile: boolean } | undefined;
    const result = planAutomationCommand({
      playerId: "ai-1",
      points: 500,
      manpower: 10,
      settledTileCount: 4,
      townCount: 1,
      incomePerMinute: 9,
      hasActiveLock: false,
      activeDevelopmentProcessCount: 0,
      frontierTiles: [localFrontier],
      ownedTiles: [ownedDock, localFrontier],
      tilesByKey: new Map([
        ["10,10", ownedDock],
        ["11,10", localFrontier],
        ["12,10", localScout],
        ["50,50", remoteDock]
      ]),
      dockLinksByDockTileKey,
      clientSeq: 20,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    expect(result.command).toMatchObject({
      type: "EXPAND",
      payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 50, toY: 50 })
    });
  });

  it("claims neutral town-support ring tiles before generic pressure", () => {
    const supportTown = makeTile(0, 0, {
      ownerId: "ai-1",
      ownershipState: "SETTLED",
      town: { name: "Core", type: "FARMING", populationTier: "TOWN", supportMax: 3, supportCurrent: 0 }
    });
    const supportTarget = makeTile(1, 0, {});
    const pressureFrontier = makeTile(5, 5, { ownerId: "ai-1", ownershipState: "FRONTIER" });
    const enemy = makeTile(6, 5, { ownerId: "enemy-1" });

    const result = planAutomationCommand({
      playerId: "ai-1",
      points: 3,
      manpower: 100,
      settledTileCount: 4,
      townCount: 1,
      incomePerMinute: 10,
      strategicResources: { FOOD: 30 },
      hasActiveLock: false,
      activeDevelopmentProcessCount: 0,
      frontierTiles: [pressureFrontier],
      strategicFrontierTiles: [pressureFrontier],
      ownedTiles: [supportTown, pressureFrontier],
      tilesByKey: new Map([
        ["0,0", supportTown],
        ["1,0", supportTarget],
        ["5,5", pressureFrontier],
        ["6,5", enemy]
      ]),
      clientSeq: 22,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    expect(result.command).toMatchObject({
      type: "EXPAND",
      payloadJson: JSON.stringify({ fromX: 0, fromY: 0, toX: 1, toY: 0 })
    });
    expect(result.diagnostic.frontierOpportunityTownSupport).toBe(1);
  });

  it("detects town-support deficit from neighbor terrain when supportMax/supportCurrent are unset", () => {
    const supportTown = makeTile(0, 0, {
      ownerId: "ai-1",
      ownershipState: "SETTLED",
      town: { name: "Core", type: "FARMING", populationTier: "TOWN" }
    });
    const supportTarget = makeTile(1, 0, {});
    const pressureFrontier = makeTile(5, 5, { ownerId: "ai-1", ownershipState: "FRONTIER" });
    const enemy = makeTile(6, 5, { ownerId: "enemy-1" });

    const result = planAutomationCommand({
      playerId: "ai-1",
      points: 3,
      manpower: 100,
      settledTileCount: 4,
      townCount: 1,
      incomePerMinute: 10,
      strategicResources: { FOOD: 30 },
      hasActiveLock: false,
      activeDevelopmentProcessCount: 0,
      frontierTiles: [pressureFrontier],
      strategicFrontierTiles: [pressureFrontier],
      ownedTiles: [supportTown, pressureFrontier],
      tilesByKey: new Map([
        ["0,0", supportTown],
        ["1,0", supportTarget],
        ["5,5", pressureFrontier],
        ["6,5", enemy]
      ]),
      clientSeq: 24,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    expect(result.command).toMatchObject({
      type: "EXPAND",
      payloadJson: JSON.stringify({ fromX: 0, fromY: 0, toX: 1, toY: 0 })
    });
    expect(result.diagnostic.frontierOpportunityTownSupport).toBe(1);
  });

  it("does not treat SETTLEMENT-tier spawn towns as having a support deficit", () => {
    const spawnSettlement = makeTile(0, 0, {
      ownerId: "ai-1",
      ownershipState: "SETTLED",
      town: { name: "Spawn", type: "FARMING", populationTier: "SETTLEMENT" }
    });
    const neutralNeighbor = makeTile(1, 0, {});

    const result = planAutomationCommand({
      playerId: "ai-1",
      points: 3,
      manpower: 100,
      settledTileCount: 1,
      townCount: 1,
      incomePerMinute: 1,
      strategicResources: { FOOD: 30 },
      hasActiveLock: false,
      activeDevelopmentProcessCount: 0,
      frontierTiles: [],
      ownedTiles: [spawnSettlement],
      tilesByKey: new Map([
        ["0,0", spawnSettlement],
        ["1,0", neutralNeighbor]
      ]),
      clientSeq: 25,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    expect(result.diagnostic.frontierOpportunityTownSupport ?? 0).toBe(0);
  });

  it("prefers a neutral FARM over a neutral world town when food coverage is low", () => {
    const ownedSettled = makeTile(0, 0, { ownerId: "ai-1", ownershipState: "SETTLED" });
    const neutralFarm = makeTile(1, 0, { resource: "FARM" });
    const neutralWorldTown = makeTile(1, 1, { town: { name: "World", type: "MARKET", populationTier: "TOWN" } });

    const result = planAutomationCommand({
      playerId: "ai-1",
      points: 500,
      manpower: 100,
      settledTileCount: 1,
      townCount: 0,
      incomePerMinute: 1,
      hasActiveLock: false,
      activeDevelopmentProcessCount: 0,
      frontierTiles: [],
      ownedTiles: [ownedSettled],
      tilesByKey: new Map([
        ["0,0", ownedSettled],
        ["1,0", neutralFarm],
        ["1,1", neutralWorldTown]
      ]),
      clientSeq: 27,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    expect(result.command).toMatchObject({
      type: "EXPAND",
      payloadJson: JSON.stringify({ fromX: 0, fromY: 0, toX: 1, toY: 0 })
    });
  });

  it("still prefers the world town over the FARM when food coverage is healthy", () => {
    const ownedSettled = makeTile(0, 0, { ownerId: "ai-1", ownershipState: "SETTLED" });
    const neutralFarm = makeTile(1, 0, { resource: "FARM" });
    const neutralWorldTown = makeTile(1, 1, { town: { name: "World", type: "MARKET", populationTier: "TOWN" } });

    const result = planAutomationCommand({
      playerId: "ai-1",
      points: 500,
      manpower: 100,
      settledTileCount: 1,
      townCount: 0,
      incomePerMinute: 1,
      strategicResources: { FOOD: 100 },
      hasActiveLock: false,
      activeDevelopmentProcessCount: 0,
      frontierTiles: [],
      ownedTiles: [ownedSettled],
      tilesByKey: new Map([
        ["0,0", ownedSettled],
        ["1,0", neutralFarm],
        ["1,1", neutralWorldTown]
      ]),
      clientSeq: 28,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    expect(result.command).toMatchObject({
      type: "EXPAND",
      payloadJson: JSON.stringify({ fromX: 0, fromY: 0, toX: 1, toY: 1 })
    });
  });

  it("falls back from narrow strategic origins to full frontier origins when the narrow set is empty", () => {
    const deadStrategicFrontier = makeTile(0, 0, { ownerId: "ai-1", ownershipState: "FRONTIER", resource: "FARM" });
    const activeFrontier = makeTile(10, 10, { ownerId: "ai-1", ownershipState: "FRONTIER" });
    // Economic tile (resource) ensures economicExpand fires once the broad fallback finds it.
    const activeTarget = makeTile(11, 10, { resource: "IRON" });

    const result = planAutomationCommand({
      playerId: "ai-1",
      points: 3,
      manpower: 10,
      settledTileCount: 4,
      townCount: 1,
      incomePerMinute: 8,
      hasActiveLock: false,
      activeDevelopmentProcessCount: 0,
      frontierTiles: [deadStrategicFrontier, activeFrontier],
      strategicFrontierTiles: [deadStrategicFrontier],
      ownedTiles: [deadStrategicFrontier, activeFrontier],
      tilesByKey: new Map([
        ["0,0", deadStrategicFrontier],
        ["10,10", activeFrontier],
        ["11,10", activeTarget]
      ]),
      clientSeq: 23,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    expect(result.command).toMatchObject({
      type: "EXPAND",
      payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 11, toY: 10 })
    });
    expect(result.diagnostic.frontierOriginCount).toBe(2);
  });

  it("prefers pressure attacks over neutral growth on town-control fronts", () => {
    const town = makeTile(0, 0, {
      ownerId: "ai-1",
      ownershipState: "SETTLED",
      town: { name: "Core", type: "MARKET", populationTier: "TOWN", supportMax: 0, supportCurrent: 0 }
    });
    const frontier = makeTile(1, 0, { ownerId: "ai-1", ownershipState: "FRONTIER" });
    const enemy = makeTile(1, 1, { ownerId: "enemy-1" });
    const neutral = makeTile(2, 0, { resource: "FARM" });

    const result = planAutomationCommand({
      playerId: "ai-1",
      points: 700,
      manpower: 100,
      settledTileCount: 5,
      townCount: 2,
      incomePerMinute: 9,
      hasActiveLock: false,
      activeDevelopmentProcessCount: 0,
      frontierTiles: [frontier],
      ownedTiles: [town, frontier],
      tilesByKey: new Map([
        ["0,0", town],
        ["1,0", frontier],
        ["1,1", enemy],
        ["2,0", neutral]
      ]),
      clientSeq: 22,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    expect(result.command).toMatchObject({
      type: "ATTACK",
      payloadJson: JSON.stringify({ fromX: 1, fromY: 0, toX: 1, toY: 1 })
    });
  });

  it("retains a remembered economic path while still choosing frontier growth", () => {
    const town = makeTile(0, 0, {
      ownerId: "ai-1",
      ownershipState: "SETTLED",
      town: { name: "Core", type: "MARKET", populationTier: "TOWN", supportMax: 0, supportCurrent: 0 }
    });
    const frontier = makeTile(1, 0, { ownerId: "ai-1", ownershipState: "FRONTIER" });
    const enemy = makeTile(1, 1, { ownerId: "enemy-1" });
    const neutralFarm = makeTile(2, 0, { resource: "FARM" });
    let plannedVictoryPath: string | undefined;

    const result = planAutomationCommand({
      playerId: "ai-1",
      points: 80,
      manpower: 0,
      settledTileCount: 5,
      townCount: 1,
      incomePerMinute: 7,
      hasActiveLock: false,
      activeDevelopmentProcessCount: 0,
      frontierTiles: [frontier],
      ownedTiles: [town, frontier],
      tilesByKey: new Map([
        ["0,0", town],
        ["1,0", frontier],
        ["1,1", enemy],
        ["2,0", neutralFarm]
      ]),
      previousVictoryPath: "ECONOMIC_HEGEMONY",
      onStrategicSnapshot: (snapshot) => {
        plannedVictoryPath = snapshot.primaryVictoryPath;
      },
      clientSeq: 24,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    expect(plannedVictoryPath).toBe("ECONOMIC_HEGEMONY");
    expect(result.command).toMatchObject({
      type: "EXPAND",
      payloadJson: JSON.stringify({ fromX: 1, fromY: 0, toX: 2, toY: 0 })
    });
  });

  it("uses opening scout expansion for no-town starts before weaker fallback actions", () => {
    const settled = makeTile(20, 19, { ownerId: "ai-1", ownershipState: "SETTLED" });
    const frontier = makeTile(20, 20, { ownerId: "ai-1", ownershipState: "FRONTIER" });
    const scout = makeTile(21, 20, {});
    const novelLand = makeTile(22, 20, {});
    const coastline = { x: 21, y: 19, terrain: "SEA" as const };

    const result = planAutomationCommand({
      playerId: "ai-1",
      points: 500,
      manpower: 10,
      settledTileCount: 1,
      townCount: 0,
      incomePerMinute: 2,
      hasActiveLock: false,
      activeDevelopmentProcessCount: 0,
      frontierTiles: [frontier],
      ownedTiles: [settled, frontier],
      tilesByKey: new Map([
        ["20,19", settled],
        ["20,20", frontier],
        ["21,20", scout],
        ["22,20", novelLand],
        ["21,19", coastline]
      ]),
      clientSeq: 23,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    expect(result.command).toMatchObject({
      type: "EXPAND",
      payloadJson: JSON.stringify({ fromX: 20, fromY: 20, toX: 21, toY: 20 })
    });
  });

  it("uses goap to fortify threatened town-control fronts before generic growth", () => {
    const town = makeTile(0, 0, {
      ownerId: "ai-1",
      ownershipState: "SETTLED",
      town: { name: "Core", type: "MARKET", populationTier: "TOWN", supportMax: 0, supportCurrent: 0 }
    });
    const frontier = makeTile(1, 0, { ownerId: "ai-1", ownershipState: "FRONTIER" });
    const enemy = makeTile(1, 1, { ownerId: "enemy-1" });
    const neutral = makeTile(2, 0, {});

    const result = planAutomationCommand({
      playerId: "ai-1",
      points: 5_000,
      manpower: 0,
      techIds: ["masonry"],
      strategicResources: { IRON: 60 },
      settledTileCount: 5,
      townCount: 2,
      incomePerMinute: 0,
      hasActiveLock: false,
      activeDevelopmentProcessCount: 0,
      frontierTiles: [frontier],
      ownedTiles: [town, frontier],
      tilesByKey: new Map([
        ["0,0", town],
        ["1,0", frontier],
        ["1,1", enemy],
        ["2,0", neutral]
      ]),
      previousVictoryPath: "TOWN_CONTROL",
      clientSeq: 25,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    expect(result.command).toMatchObject({
      type: "BUILD_FORT",
      payloadJson: JSON.stringify({ x: 0, y: 0 })
    });
  });

  it("uses enemy pressure fallback even when a barbarian target scores higher on the same front", () => {
    const town = makeTile(0, 0, {
      ownerId: "ai-1",
      ownershipState: "SETTLED",
      town: { name: "Core", type: "MARKET", populationTier: "TOWN", supportMax: 0, supportCurrent: 0 }
    });
    const frontier = makeTile(1, 0, { ownerId: "ai-1", ownershipState: "FRONTIER" });
    const enemy = makeTile(2, 0, { ownerId: "enemy-1" });
    const barbarianDock = makeTile(1, 1, { ownerId: "barbarian", ownershipState: "BARBARIAN", dockId: "dock-b" });

    const result = planAutomationCommand({
      playerId: "ai-1",
      points: 700,
      manpower: 100,
      settledTileCount: 5,
      townCount: 2,
      incomePerMinute: 9,
      hasActiveLock: false,
      activeDevelopmentProcessCount: 0,
      frontierTiles: [frontier],
      ownedTiles: [town, frontier],
      tilesByKey: new Map([
        ["0,0", town],
        ["1,0", frontier],
        ["2,0", enemy],
        ["1,1", barbarianDock]
      ]),
      previousVictoryPath: "TOWN_CONTROL",
      clientSeq: 26,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    expect(result.command).toMatchObject({
      type: "ATTACK",
      payloadJson: JSON.stringify({ fromX: 1, fromY: 0, toX: 2, toY: 0 })
    });
  });
});
