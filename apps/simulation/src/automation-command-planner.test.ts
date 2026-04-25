import { describe, expect, it } from "vitest";
import { DEVELOPMENT_PROCESS_LIMIT } from "@border-empires/shared";

import { buildDockLinksByDockTileKey } from "./dock-network.js";
import { planAutomationCommand } from "./automation-command-planner.js";

const makeTile = (
  x: number,
  y: number,
  overrides: Partial<{
    terrain: "LAND" | "SEA" | "MOUNTAIN";
    ownerId: string;
    resource: string;
    dockId: string;
    town: { supportMax?: number; supportCurrent?: number } | null;
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
    const frontier = makeTile(1, 1, { ownerId: "ai-1", dockId: "dock-1" });
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

  it("reports insufficient_manpower_for_attack when only enemy land is adjacent", () => {
    const owned = makeTile(0, 0, { ownerId: "ai-1" });
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

  it("reports no_frontier_targets when no legal land expansion or attack exists", () => {
    const owned = makeTile(0, 0, { ownerId: "ai-1" });
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

  it("uses dock-linked frontier expansion when strategic settlement has no target", () => {
    const ownedDock = makeTile(10, 10, { ownerId: "ai-1", dockId: "dock-a" });
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
      activeDevelopmentProcessCount: DEVELOPMENT_PROCESS_LIMIT,
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
});
