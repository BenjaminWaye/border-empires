import { describe, expect, it } from "vitest";
import { DEVELOPMENT_PROCESS_LIMIT } from "@border-empires/shared";

import { buildDockLinksByDockTileKey } from "../dock-network/dock-network.js";
import { goapGoldReserveHealthy, planAutomationCommand } from "./automation-command-planner.js";

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
    strategicResources: Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD", number>>;
    techIds: string[];
    settledTileCount: number;
    townCount: number;
    incomePerMinute: number;
  }> = {}
) => ({
  x,
  y,
  terrain: "LAND" as const,
  ...overrides
});

describe("automation command planner", () => {
  it("reports player_missing diagnostics via helper factory-compatible shape", () => {
    const result = planAutomationCommand({
      playerId: "ai-1",
      points: 0,
      manpower: 0,
      hasActiveLock: true,
      activeDevelopmentProcessCount: 0,
      frontierTiles: [],
      ownedTiles: [],
      tilesByKey: new Map(),
      clientSeq: 1,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    expect(result.command).toBeUndefined();
    expect(result.diagnostic.noCommandReason).toBe("active_lock");
  });

  it("returns a settle command when a strategic frontier tile exists", () => {
    const frontier = makeTile(1, 1, { ownerId: "ai-1", ownershipState: "FRONTIER", dockId: "dock-1" });
    const result = planAutomationCommand({
      playerId: "ai-1",
      points: 500,
      manpower: 10,
      hasActiveLock: false,
      activeDevelopmentProcessCount: 0,
      frontierTiles: [frontier],
      ownedTiles: [frontier],
      tilesByKey: new Map([["1,1", frontier]]),
      clientSeq: 1,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    expect(result.command?.type).toBe("SETTLE");
    expect(result.diagnostic.settlementCandidateFound).toBe(true);
  });

  it("falls back to owned frontier tiles when frontier lists are empty", () => {
    const frontier = makeTile(2, 2, {
      ownerId: "ai-1",
      ownershipState: "FRONTIER",
      dockId: "dock-1"
    });
    const result = planAutomationCommand({
      playerId: "ai-1",
      points: 500,
      manpower: 10,
      hasActiveLock: false,
      activeDevelopmentProcessCount: 0,
      frontierTiles: [],
      ownedTiles: [frontier],
      tilesByKey: new Map([["2,2", frontier]]),
      clientSeq: 101,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    expect(result.command).toMatchObject({
      type: "SETTLE",
      payloadJson: JSON.stringify({ x: 2, y: 2 })
    });
    expect(result.diagnostic.settlementCandidateFound).toBe(true);
  });

  it("reports insufficient_manpower_for_attack when only enemy land is adjacent", () => {
    const owned = makeTile(0, 0, { ownerId: "ai-1", ownershipState: "FRONTIER" });
    const enemy = makeTile(1, 0, { ownerId: "enemy-1" });
    const tilesByKey = new Map([
      ["0,0", owned],
      ["1,0", enemy]
    ]);
    const result = planAutomationCommand({
      playerId: "ai-1",
      points: 500,
      manpower: 0,
      hasActiveLock: false,
      activeDevelopmentProcessCount: 2,
      frontierTiles: [],
      ownedTiles: [owned],
      tilesByKey,
      clientSeq: 1,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    expect(result.command).toBeUndefined();
    expect(result.diagnostic.frontierEnemyTargetCount).toBe(1);
    expect(result.diagnostic.noCommandReason).toBe("insufficient_manpower_for_attack");
  });

  it("idles with insufficient_points when no frontier exists (passive income handles resource credit)", () => {
    const settlement = makeTile(0, 0, {
      ownerId: "ai-1",
      ownershipState: "SETTLED",
      town: { name: "Grain", populationTier: "SETTLEMENT" }
    });
    const result = planAutomationCommand({
      playerId: "ai-1",
      points: 0,
      manpower: 10,
      hasActiveLock: false,
      activeDevelopmentProcessCount: 0,
      frontierTiles: [],
      ownedTiles: [settlement],
      tilesByKey: new Map([["0,0", settlement]]),
      clientSeq: 2,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    // With passive income, the planner no longer emits COLLECT_VISIBLE when stuck.
    // Income arrives via the server-side tick instead.
    expect(result.command).toBeUndefined();
    expect(result.diagnostic.noCommandReason).toBe("insufficient_points");
  });

  it("reports no_frontier_targets when no legal land expansion or attack exists", () => {
    const owned = makeTile(0, 0, { ownerId: "ai-1", ownershipState: "FRONTIER" });
    const sea = makeTile(1, 0, { terrain: "SEA" });
    const mountain = makeTile(0, 1, { terrain: "MOUNTAIN" });
    const tilesByKey = new Map([
      ["0,0", owned],
      ["1,0", sea],
      ["0,1", mountain]
    ]);
    const result = planAutomationCommand({
      playerId: "ai-1",
      points: 500,
      manpower: 10,
      hasActiveLock: false,
      activeDevelopmentProcessCount: 0,
      frontierTiles: [],
      ownedTiles: [owned],
      tilesByKey,
      clientSeq: 1,
      issuedAt: 1000,
      sessionPrefix: "system-runtime"
    });

    expect(result.command).toBeUndefined();
    expect(result.diagnostic.noCommandReason).toBe("no_frontier_targets");
  });

  it("reports no_frontier_targets instead of no_settlement_target when nothing actionable exists", () => {
    const settled = makeTile(0, 0, {
      ownerId: "ai-1",
      ownershipState: "SETTLED",
      town: { name: "Core", populationTier: "TOWN" }
    });
    const result = planAutomationCommand({
      playerId: "ai-1",
      points: 500,
      manpower: 10,
      hasActiveLock: false,
      activeDevelopmentProcessCount: 0,
      frontierTiles: [],
      ownedTiles: [settled],
      tilesByKey: new Map([["0,0", settled]]),
      playerScopeKeyCount: 1,
      playerScopeTileCount: 1,
      clientSeq: 102,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    expect(result.command).toBeUndefined();
    expect(result.diagnostic.settlementEligible).toBe(true);
    expect(result.diagnostic.settlementCandidateFound).toBe(false);
    expect(result.diagnostic.noCommandReason).toBe("no_frontier_targets");
    expect(result.diagnostic.ownedTileCount).toBe(1);
    expect(result.diagnostic.ownedFrontierTileCount).toBe(0);
    expect(result.diagnostic.frontierTileCountInput).toBe(0);
    expect(result.diagnostic.frontierOriginCount).toBe(1);
    expect(result.diagnostic.playerScopeKeyCount).toBe(1);
    expect(result.diagnostic.playerScopeTileCount).toBe(1);
    expect(result.diagnostic.frontierOpportunityEconomic).toBe(0);
    expect(result.diagnostic.frontierOpportunityScout).toBe(0);
  });

  it("uses dock-linked frontier expansion when strategic settlement has no target", () => {
    const ownedDock = makeTile(10, 10, { ownerId: "ai-1", ownershipState: "SETTLED", dockId: "dock-a" });
    const linkedDock = makeTile(50, 50, { dockId: "dock-b" });
    const target = makeTile(51, 50, { resource: "FARM" });
    const dockLinksByDockTileKey = buildDockLinksByDockTileKey([
      { dockId: "dock-a", tileKey: "10,10", pairedDockId: "dock-b", connectedDockIds: ["dock-b"] },
      { dockId: "dock-b", tileKey: "50,50", pairedDockId: "dock-a", connectedDockIds: ["dock-a"] }
    ]);
    const result = planAutomationCommand({
      playerId: "ai-1",
      points: 500,
      manpower: 10,
      hasActiveLock: false,
      activeDevelopmentProcessCount: 0,
      frontierTiles: [],
      ownedTiles: [ownedDock],
      tilesByKey: new Map([
        ["10,10", ownedDock],
        ["50,50", linkedDock],
        ["51,50", target]
      ]),
      dockLinksByDockTileKey,
      clientSeq: 2,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    expect(result.command).toMatchObject({
      type: "EXPAND",
      payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 50, toY: 50 })
    });
  });

  it("builds an economic structure when income is weak and a good settled resource tile exists", () => {
    const ownedTown = makeTile(5, 5, {
      ownerId: "ai-1",
      ownershipState: "SETTLED",
      town: { type: "MARKET", name: "Town", populationTier: "TOWN" }
    });
    const result = planAutomationCommand({
      playerId: "ai-1",
      points: 5_000,
      manpower: 10,
      techIds: ["trade"],
      strategicResources: { FOOD: 60 },
      settledTileCount: 6,
      townCount: 1,
      incomePerMinute: 0,
      hasActiveLock: false,
      activeDevelopmentProcessCount: 0,
      frontierTiles: [],
      ownedTiles: [ownedTown],
      tilesByKey: new Map([["5,5", ownedTown]]),
      clientSeq: 3,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    expect(result.command).toMatchObject({
      type: "BUILD_ECONOMIC_STRUCTURE",
      payloadJson: JSON.stringify({ x: 5, y: 5, structureType: "MARKET" })
    });
  });

  it("builds a fort on an exposed settled core tile when enemies crowd the frontier", () => {
    const town = makeTile(8, 8, {
      ownerId: "ai-1",
      ownershipState: "SETTLED",
      town: { type: "FARMING", name: "Town", populationTier: "TOWN" }
    });
    const enemyA = makeTile(9, 8, { ownerId: "enemy-1" });
    const enemyB = makeTile(8, 9, { ownerId: "enemy-2" });
    const result = planAutomationCommand({
      playerId: "ai-1",
      points: 5_000,
      manpower: 10,
      techIds: ["masonry"],
      strategicResources: { IRON: 60 },
      settledTileCount: 3,
      townCount: 1,
      incomePerMinute: 6,
      hasActiveLock: false,
      activeDevelopmentProcessCount: 0,
      frontierTiles: [],
      ownedTiles: [town],
      tilesByKey: new Map([
        ["8,8", town],
        ["9,8", enemyA],
        ["8,9", enemyB]
      ]),
      clientSeq: 4,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    expect(result.command).toMatchObject({
      type: "BUILD_FORT",
      payloadJson: JSON.stringify({ x: 8, y: 8 })
    });
  });

  it("settles a defensively compact fallback frontier tile instead of idling", () => {
    const settledA = makeTile(0, 1, {
      ownerId: "ai-1",
      ownershipState: "SETTLED",
      town: { name: "A", populationTier: "SETTLEMENT" }
    });
    const settledB = makeTile(1, 0, {
      ownerId: "ai-1",
      ownershipState: "SETTLED",
      town: { name: "B", populationTier: "SETTLEMENT" }
    });
    const settledC = makeTile(1, 2, {
      ownerId: "ai-1",
      ownershipState: "SETTLED",
      town: { name: "C", populationTier: "SETTLEMENT" }
    });
    const frontier = makeTile(1, 1, {
      ownerId: "ai-1",
      ownershipState: "FRONTIER"
    });
    const result = planAutomationCommand({
      playerId: "ai-1",
      points: 500,
      manpower: 10,
      settledTileCount: 3,
      townCount: 3,
      incomePerMinute: 6,
      hasActiveLock: false,
      activeDevelopmentProcessCount: 0,
      frontierTiles: [frontier],
      ownedTiles: [settledA, settledB, settledC, frontier],
      tilesByKey: new Map([
        ["0,1", settledA],
        ["1,0", settledB],
        ["1,2", settledC],
        ["1,1", frontier]
      ]),
      clientSeq: 5,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    expect(result.command).toMatchObject({
      type: "SETTLE",
      payloadJson: JSON.stringify({ x: 1, y: 1 })
    });
  });

  it("suppresses non-directed expansion onto plain tiles when no expansion objective is set", () => {
    // Plain tiles (no resource/town/dock) should not be expanded unless there is an
    // expansionObjective pointing toward them. Frontier tiles decay in ~10 min so
    // aimless expansion burns gold with no net gain.
    const owned = makeTile(0, 0, { ownerId: "ai-1", ownershipState: "SETTLED" });
    const frontier = makeTile(1, 0, { ownerId: "ai-1", ownershipState: "FRONTIER" });
    const plain = makeTile(2, 0, {});
    const result = planAutomationCommand({
      playerId: "ai-1",
      points: 500,
      manpower: 10,
      settledTileCount: 1,
      townCount: 0,
      incomePerMinute: 5,
      hasActiveLock: false,
      activeDevelopmentProcessCount: DEVELOPMENT_PROCESS_LIMIT,
      frontierTiles: [frontier],
      hotFrontierTiles: [frontier],
      strategicFrontierTiles: [frontier],
      ownedTiles: [owned, frontier],
      tilesByKey: new Map([
        ["0,0", owned],
        ["1,0", frontier],
        ["2,0", plain]
      ]),
      clientSeq: 6,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    // No economic tile adjacent and no expansionObjective → no expansion.
    expect(result.command).toBeUndefined();
  });

  it("prefers settlement over economic build when both are legal", () => {
    const town = makeTile(0, 0, {
      ownerId: "ai-1",
      ownershipState: "SETTLED",
      town: { type: "MARKET", name: "Core", populationTier: "TOWN" }
    });
    const strategicFrontier = makeTile(1, 0, {
      ownerId: "ai-1",
      ownershipState: "FRONTIER",
      dockId: "dock-a"
    });
    const result = planAutomationCommand({
      playerId: "ai-1",
      points: 5_000,
      manpower: 10,
      techIds: ["trade"],
      strategicResources: { FOOD: 60 },
      settledTileCount: 1,
      townCount: 1,
      incomePerMinute: 0,
      hasActiveLock: false,
      activeDevelopmentProcessCount: 0,
      frontierTiles: [strategicFrontier],
      strategicFrontierTiles: [strategicFrontier],
      buildCandidateTiles: [town],
      ownedTiles: [town, strategicFrontier],
      tilesByKey: new Map([
        ["0,0", town],
        ["1,0", strategicFrontier]
      ]),
      clientSeq: 7,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    expect(result.command).toMatchObject({
      type: "SETTLE",
      payloadJson: JSON.stringify({ x: 1, y: 0 })
    });
  });

  it("suppresses plain expansion on mixed fronts when manpower is too low to attack", () => {
    // Plain neutral tiles don't expand without an objective. Low manpower (< ATTACK_MANPOWER_MIN)
    // means attack is also blocked, so the planner produces no command.
    const settled = makeTile(0, 0, { ownerId: "ai-1", ownershipState: "SETTLED" });
    const frontier = makeTile(1, 0, { ownerId: "ai-1", ownershipState: "FRONTIER" });
    const enemyA = makeTile(1, 1, { ownerId: "enemy-1" });
    const enemyB = makeTile(2, 1, { ownerId: "enemy-2" });
    const plain = makeTile(2, 0, {});
    const result = planAutomationCommand({
      playerId: "ai-1",
      points: 500,
      manpower: 10,
      settledTileCount: 1,
      townCount: 0,
      incomePerMinute: 5,
      hasActiveLock: false,
      activeDevelopmentProcessCount: DEVELOPMENT_PROCESS_LIMIT,
      frontierTiles: [frontier],
      hotFrontierTiles: [frontier],
      strategicFrontierTiles: [frontier],
      ownedTiles: [settled, frontier],
      tilesByKey: new Map([
        ["0,0", settled],
        ["1,0", frontier],
        ["1,1", enemyA],
        ["2,0", plain],
        ["2,1", enemyB]
      ]),
      clientSeq: 8,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    // No economic tile, no expansionObjective, and manpower too low to attack → no command.
    expect(result.command).toBeUndefined();
  });

  it("prefers fallback settlement over economic expand when economy is weak", () => {
    const settledA = makeTile(0, 1, {
      ownerId: "ai-1",
      ownershipState: "SETTLED",
      town: { name: "A", populationTier: "SETTLEMENT" }
    });
    const settledB = makeTile(1, 0, {
      ownerId: "ai-1",
      ownershipState: "SETTLED",
      town: { name: "B", populationTier: "SETTLEMENT" }
    });
    const settledC = makeTile(1, 2, {
      ownerId: "ai-1",
      ownershipState: "SETTLED",
      town: { name: "C", populationTier: "SETTLEMENT" }
    });
    const frontier = makeTile(1, 1, {
      ownerId: "ai-1",
      ownershipState: "FRONTIER"
    });
    const economicExpand = makeTile(2, 1, { resource: "FARM" });
    const result = planAutomationCommand({
      playerId: "ai-1",
      points: 500,
      manpower: 10,
      strategicResources: { FOOD: 60 },
      settledTileCount: 3,
      townCount: 3,
      incomePerMinute: 0,
      hasActiveLock: false,
      activeDevelopmentProcessCount: 0,
      frontierTiles: [frontier],
      hotFrontierTiles: [frontier],
      ownedTiles: [settledA, settledB, settledC, frontier],
      tilesByKey: new Map([
        ["0,1", settledA],
        ["1,0", settledB],
        ["1,2", settledC],
        ["1,1", frontier],
        ["2,1", economicExpand]
      ]),
      clientSeq: 9,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    expect(result.command).toMatchObject({
      type: "SETTLE",
      payloadJson: JSON.stringify({ x: 1, y: 1 })
    });
  });

  it("uses scaffold expansion when settlement is legal but the current frontier tile is poor", () => {
    const supportTown = makeTile(22, 19, {
      ownerId: "ai-1",
      ownershipState: "SETTLED",
      town: { name: "Hub", populationTier: "TOWN", supportMax: 3, supportCurrent: 0 }
    });
    const settledA = makeTile(21, 19, {
      ownerId: "ai-1",
      ownershipState: "SETTLED"
    });
    const settledB = makeTile(22, 20, {
      ownerId: "ai-1",
      ownershipState: "SETTLED"
    });
    const frontier = makeTile(20, 20, {
      ownerId: "ai-1",
      ownershipState: "FRONTIER"
    });
    const scaffold = makeTile(21, 20, {});
    const result = planAutomationCommand({
      playerId: "ai-1",
      points: 500,
      manpower: 10,
      settledTileCount: 3,
      townCount: 1,
      incomePerMinute: 5,
      hasActiveLock: false,
      activeDevelopmentProcessCount: 0,
      frontierTiles: [frontier],
      hotFrontierTiles: [frontier],
      strategicFrontierTiles: [frontier],
      ownedTiles: [supportTown, settledA, settledB, frontier],
      tilesByKey: new Map([
        ["22,19", supportTown],
        ["21,19", settledA],
        ["22,20", settledB],
        ["20,20", frontier],
        ["21,20", scaffold]
      ]),
      clientSeq: 11,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    expect(result.command).toMatchObject({
      type: "EXPAND",
      payloadJson: JSON.stringify({ fromX: 20, fromY: 20, toX: 21, toY: 20 })
    });
  });

  it("uses scout expansion when fallback settlement is legal but only scouting is worthwhile", () => {
    const settled = makeTile(20, 19, {
      ownerId: "ai-1",
      ownershipState: "SETTLED"
    });
    const frontier = makeTile(20, 20, {
      ownerId: "ai-1",
      ownershipState: "FRONTIER"
    });
    const scout = makeTile(21, 20, {});
    const novelLand = makeTile(22, 20, {});
    const coastline = {
      x: 21,
      y: 19,
      terrain: "SEA" as const
    };
    const result = planAutomationCommand({
      playerId: "ai-1",
      points: 500,
      manpower: 10,
      settledTileCount: 1,
      townCount: 0,
      incomePerMinute: 5,
      hasActiveLock: false,
      activeDevelopmentProcessCount: 0,
      frontierTiles: [frontier],
      hotFrontierTiles: [frontier],
      strategicFrontierTiles: [frontier],
      ownedTiles: [settled, frontier],
      tilesByKey: new Map([
        ["20,19", settled],
        ["20,20", frontier],
        ["21,20", scout],
        ["22,20", novelLand],
        ["21,19", coastline]
      ]),
      clientSeq: 12,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    expect(result.command).toMatchObject({
      type: "EXPAND",
      payloadJson: JSON.stringify({ fromX: 20, fromY: 20, toX: 21, toY: 20 })
    });
  });

  it("prefers fallback settlement over fort build on contested fronts", () => {
    const core = makeTile(0, 0, {
      ownerId: "ai-1",
      ownershipState: "SETTLED",
      town: { type: "FARMING", name: "Core", populationTier: "TOWN" }
    });
    const settledA = makeTile(1, 0, {
      ownerId: "ai-1",
      ownershipState: "SETTLED",
      town: { name: "A", populationTier: "SETTLEMENT" }
    });
    const settledB = makeTile(0, 1, {
      ownerId: "ai-1",
      ownershipState: "SETTLED",
      town: { name: "B", populationTier: "SETTLEMENT" }
    });
    const frontier = makeTile(1, 1, {
      ownerId: "ai-1",
      ownershipState: "FRONTIER"
    });
    const enemy = makeTile(2, 0, { ownerId: "enemy-1" });
    const result = planAutomationCommand({
      playerId: "ai-1",
      points: 5_000,
      manpower: 10,
      techIds: ["masonry"],
      strategicResources: { IRON: 60, FOOD: 60 },
      settledTileCount: 3,
      townCount: 3,
      incomePerMinute: 6,
      hasActiveLock: false,
      activeDevelopmentProcessCount: 0,
      frontierTiles: [frontier],
      ownedTiles: [core, settledA, settledB, frontier],
      tilesByKey: new Map([
        ["0,0", core],
        ["1,0", settledA],
        ["0,1", settledB],
        ["1,1", frontier],
        ["2,0", enemy]
      ]),
      clientSeq: 10,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    expect(result.command).toMatchObject({
      type: "SETTLE",
      payloadJson: JSON.stringify({ x: 1, y: 1 })
    });
  });

  it("does not force a mediocre fallback settlement when no frontier actions exist", () => {
    const settled = makeTile(10, 10, {
      ownerId: "ai-1",
      ownershipState: "SETTLED",
      town: { name: "Core", populationTier: "TOWN" }
    });
    const frontier = makeTile(11, 10, {
      ownerId: "ai-1",
      ownershipState: "FRONTIER"
    });
    const result = planAutomationCommand({
      playerId: "ai-1",
      points: 500,
      manpower: 10,
      settledTileCount: 3,
      townCount: 1,
      incomePerMinute: 1,
      hasActiveLock: false,
      activeDevelopmentProcessCount: 0,
      frontierTiles: [frontier],
      hotFrontierTiles: [frontier],
      strategicFrontierTiles: [],
      ownedTiles: [settled, frontier],
      tilesByKey: new Map([
        ["10,10", settled],
        ["11,10", frontier]
      ]),
      preplanProgressState: "tech_unaffordable",
      clientSeq: 103,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    expect(result.command).toBeUndefined();
    expect(result.diagnostic.noCommandReason).toBe("no_frontier_targets");
  });

  it("prefers scout expansion over mediocre fallback settlement while first tech is unaffordable", () => {
    const settled = makeTile(20, 19, {
      ownerId: "ai-1",
      ownershipState: "SETTLED"
    });
    const frontier = makeTile(20, 20, {
      ownerId: "ai-1",
      ownershipState: "FRONTIER"
    });
    const fallbackSettle = makeTile(19, 20, {});
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
      hotFrontierTiles: [frontier],
      strategicFrontierTiles: [frontier],
      ownedTiles: [settled, frontier],
      tilesByKey: new Map([
        ["20,19", settled],
        ["20,20", frontier],
        ["19,20", fallbackSettle],
        ["21,20", scout],
        ["22,20", novelLand],
        ["21,19", coastline]
      ]),
      preplanProgressState: "tech_unaffordable",
      clientSeq: 13,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    expect(result.command).toMatchObject({
      type: "EXPAND",
      payloadJson: JSON.stringify({ fromX: 20, fromY: 20, toX: 21, toY: 20 })
    });
  });

  it("still settles immediately for an economically interesting fallback tile while first tech is unaffordable", () => {
    const settled = makeTile(10, 9, { ownerId: "ai-1", ownershipState: "SETTLED" });
    const frontier = makeTile(10, 10, { ownerId: "ai-1", ownershipState: "FRONTIER" });
    const plainStrategic = makeTile(11, 10, { ownerId: "ai-1", ownershipState: "FRONTIER" });
    const richFallback = makeTile(9, 10, { ownerId: "ai-1", ownershipState: "FRONTIER", resource: "IRON" });
    const scout = makeTile(10, 11, {});
    const result = planAutomationCommand({
      playerId: "ai-1",
      points: 500,
      manpower: 10,
      settledTileCount: 1,
      townCount: 0,
      incomePerMinute: 2,
      hasActiveLock: false,
      activeDevelopmentProcessCount: 0,
      frontierTiles: [frontier, plainStrategic, richFallback],
      hotFrontierTiles: [frontier, plainStrategic, richFallback],
      strategicFrontierTiles: [plainStrategic],
      ownedTiles: [settled, frontier, plainStrategic, richFallback],
      tilesByKey: new Map([
        ["10,9", settled],
        ["10,10", frontier],
        ["11,10", plainStrategic],
        ["9,10", richFallback],
        ["10,11", scout]
      ]),
      preplanProgressState: "tech_unaffordable",
      clientSeq: 14,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    expect(result.command).toMatchObject({
      type: "SETTLE",
      payloadJson: JSON.stringify({ x: 9, y: 10 })
    });
  });

  it("honors goap wait_and_recover instead of falling through to late scout expansion", () => {
    const settled = makeTile(0, 0, { ownerId: "ai-1", ownershipState: "SETTLED" });
    const enemy = makeTile(1, 0, { ownerId: "enemy-1" });
    const scout = makeTile(0, 1, {});
    const novelLand = makeTile(0, 2, {});
    const coastline = { x: 1, y: 1, terrain: "SEA" as const };

    const result = planAutomationCommand({
      playerId: "ai-1",
      points: 100,
      manpower: 0,
      settledTileCount: 2,
      townCount: 0,
      incomePerMinute: 4,
      hasActiveLock: false,
      activeDevelopmentProcessCount: 0,
      frontierTiles: [],
      ownedTiles: [settled],
      tilesByKey: new Map([
        ["0,0", settled],
        ["1,0", enemy],
        ["0,1", scout],
        ["0,2", novelLand],
        ["1,1", coastline]
      ]),
      previousVictoryPath: "DIPLOMATIC_DOMINANCE",
      clientSeq: 15,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    expect(result.command).toBeUndefined();
    expect(result.diagnostic.noCommandReason).toBe("wait_and_recover");
  });

  it("skips broad-fallback when owned tiles exceed threshold", () => {
    const tileCount = 501;
    const ownedTiles = Array.from({ length: tileCount }, (_, i) =>
      makeTile(0, i, { ownerId: "ai-1", ownershipState: "FRONTIER" })
    );
    const tilesByKey = new Map(ownedTiles.map((t) => [`${t.x},${t.y}`, t]));
    const frontierTiles = ownedTiles.slice(0, 3);

    const result = planAutomationCommand({
      playerId: "ai-1",
      points: 1000,
      manpower: 100,
      hasActiveLock: false,
      activeDevelopmentProcessCount: 0,
      frontierTiles,
      ownedTiles,
      tilesByKey,
      clientSeq: 1,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    expect(result.diagnostic.broadFallbackSkipped).toBe(true);
  });

  it("matches the legacy goldHealthy reserve threshold for the goap adapter", () => {
    expect(goapGoldReserveHealthy(4)).toBe(false);
    expect(goapGoldReserveHealthy(5)).toBe(true);
  });

});
