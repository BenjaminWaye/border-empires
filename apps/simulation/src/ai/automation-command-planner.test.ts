import { describe, expect, it } from "vitest";
import { DEVELOPMENT_PROCESS_LIMIT } from "@border-empires/shared";

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
    expect(result.diagnostic.scanFoundActionableCandidate).toBeUndefined();
  });

  it("idles with wait_and_recover when only enemy land is adjacent and manpower is low", () => {
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
    expect(result.diagnostic.noCommandReason).toBe("wait_and_recover");
    // A target was found even though manpower gates the actual attack -
    // "found" tracks scan results, not whether a command was issued.
    expect(result.diagnostic.scanFoundActionableCandidate).toBe(true);
  });

  it("idles with wait_and_recover when no frontier exists and points are zero", () => {
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

    expect(result.command).toBeUndefined();
    expect(result.diagnostic.noCommandReason).toBe("wait_and_recover");
    expect(result.diagnostic.scanFoundActionableCandidate).toBe(false);
  });

  it("reports wait_and_recover when no legal land expansion or attack exists", () => {
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
    expect(result.diagnostic.noCommandReason).toBe("wait_and_recover");
  });

  it("reports wait_and_recover instead of no_settlement_target when nothing actionable exists", () => {
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
    expect(result.diagnostic.noCommandReason).toBe("wait_and_recover");
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
    expect(result.diagnostic.noCommandReason).toBe("wait_and_recover");
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

  it("prefers expandable frontier over wait_and_recover at late scout expansion", () => {
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

    // utility policy scores EXPAND > WAIT when a scout frontier exists
    expect(result.command?.type).toBe("EXPAND");
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

});

