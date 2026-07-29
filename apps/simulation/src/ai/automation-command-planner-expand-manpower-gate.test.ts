/**
 * Regression test for the AI EXPAND manpower-gate fix.
 *
 * Bug: `canExpand` (both here and in system-job-worker.ts, plus the parallel
 * capability flag in runtime.ts) only ever checked `points >= FRONTIER_CLAIM_COST`
 * — never `manpower >= EXPAND_MANPOWER_COST` — unlike its sibling `canAttack`,
 * which correctly combined both resources. Once EXPAND started costing
 * EXPAND_MANPOWER_COST manpower (§4.2 of docs/manpower-economy-rewrite-plan.md),
 * this meant the AI kept scoring/proposing EXPAND while manpower-starved,
 * which the server (game-domain's validateFrontierCommand) now correctly
 * rejects — wasted planning cycles and rejected commands every tick until
 * manpower regenerated.
 *
 * Fix: `canExpand` now requires both `points >= FRONTIER_CLAIM_COST` and
 * `manpower >= EXPAND_MANPOWER_COST`, matching `canAttack`'s pattern.
 */
import { describe, expect, it } from "vitest";
import { EXPAND_MANPOWER_COST } from "@border-empires/shared";

import { buildDockLinksByDockTileKey } from "../dock-network/dock-network.js";
import { planAutomationCommand } from "./automation-command-planner.js";

const makeTile = (x: number, y: number, overrides: Partial<{ ownerId: string; ownershipState: string; dockId: string; resource: string }> = {}) => ({
  x,
  y,
  terrain: "LAND" as const,
  ...overrides
});

describe("automation planner EXPAND manpower gate", () => {
  it("does not propose EXPAND when manpower is below EXPAND_MANPOWER_COST, even with plenty of gold", () => {
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
      manpower: EXPAND_MANPOWER_COST - 1,
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

    expect(result.command).toBeUndefined();
  });

  it("proposes EXPAND once manpower covers EXPAND_MANPOWER_COST (same fixture, otherwise unchanged)", () => {
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
      manpower: EXPAND_MANPOWER_COST,
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
});
