/**
 * Integration tests for the utility AI path (AI_UTILITY_POLICY_ENABLED=true).
 *
 * These run planAutomationCommand through the utility dispatch rather than
 * the GOAP waterfall.  The module mock forces the flag on so the planner
 * takes the utility branch even without an env var set.
 *
 * Coverage goal: ensure the utility path preserves the key ordering guarantees
 * that the existing GOAP tests lock in, and adds the BUILD_ECONOMY regression
 * lock (BUILD_ECONOMY must never win when a frontier/attack opportunity exists).
 */

import { describe, expect, it, vi } from "vitest";

// Force the utility path.  vi.mock is hoisted above imports by Vitest so the
// module sees AI_UTILITY_POLICY_ENABLED=true before planAutomationCommand loads.
vi.mock("@border-empires/shared", async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return { ...actual, AI_UTILITY_POLICY_ENABLED: true };
});

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

describe("automation command planner — utility AI path", () => {
  // ── Basic settle / idle ──────────────────────────────────────────────────

  it("returns a settle command for a frontier dock tile", () => {
    const frontier = makeTile(1, 1, {
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
      frontierTiles: [frontier],
      ownedTiles: [frontier],
      tilesByKey: new Map([["1,1", frontier]]),
      clientSeq: 1,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    expect(result.command?.type).toBe("SETTLE");
  });

  it("falls back to wait_and_recover when no opportunities exist", () => {
    const result = planAutomationCommand({
      playerId: "ai-1",
      points: 0,
      manpower: 0,
      hasActiveLock: false,
      activeDevelopmentProcessCount: 0,
      frontierTiles: [],
      ownedTiles: [],
      tilesByKey: new Map(),
      clientSeq: 1,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    expect(result.command).toBeUndefined();
  });

  // ── BUILD_ECONOMY ordering regression lock ───────────────────────────────
  // BUILD_ECONOMY must NEVER win when a frontier expand or attack opportunity
  // exists — even when income is weak.

  it("prefers neutral frontier expand over economic build when economy is weak", () => {
    // settled town (trade tech present, income low) and a neutral neighbour
    const ownedTown = makeTile(5, 5, {
      ownerId: "ai-1",
      ownershipState: "SETTLED",
      town: { type: "MARKET", name: "Town", populationTier: "TOWN" }
    });
    const neutral = makeTile(6, 5); // unowned neutral — a valid expand target
    const result = planAutomationCommand({
      playerId: "ai-1",
      points: 5_000,
      manpower: 10,
      techIds: ["trade"],
      strategicResources: { FOOD: 60 },
      settledTileCount: 6,
      townCount: 1,
      incomePerMinute: 0, // weak economy
      hasActiveLock: false,
      activeDevelopmentProcessCount: 0,
      frontierTiles: [ownedTown],
      ownedTiles: [ownedTown],
      tilesByKey: new Map([
        ["5,5", ownedTown],
        ["6,5", neutral]
      ]),
      clientSeq: 1,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    // Utility path: EXPAND should beat BUILD_ECONOMY even with weak income
    expect(result.command?.type).toBe("EXPAND");
  });

  it("prefers attack over economic build when attackReady with enemies present", () => {
    const owned = makeTile(0, 0, { ownerId: "ai-1", ownershipState: "SETTLED" });
    const frontier = makeTile(1, 0, { ownerId: "ai-1", ownershipState: "FRONTIER" });
    const enemy = makeTile(2, 0, { ownerId: "enemy-1" });
    const result = planAutomationCommand({
      playerId: "ai-1",
      points: 5_000,
      manpower: 100,          // must exceed ATTACK_MANPOWER_MIN(60) + 15 with needsEconomy=true
      techIds: ["trade"],
      strategicResources: { FOOD: 60 },
      settledTileCount: 2,
      townCount: 1,
      incomePerMinute: 0,     // weak economy — would trigger econ build if gates fail
      hasActiveLock: false,
      activeDevelopmentProcessCount: 0,
      frontierTiles: [frontier],
      ownedTiles: [owned, frontier],
      tilesByKey: new Map([
        ["0,0", owned],
        ["1,0", frontier],
        ["2,0", enemy]
      ]),
      clientSeq: 1,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    // ATTACK should win over BUILD_ECONOMY despite weak income
    expect(result.command?.type).toBe("ATTACK");
  });

  it("economic build fires when there is no frontier opportunity", () => {
    // Mirrors the GOAP test — isolated town with no neutral neighbours
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
      frontierTiles: [],           // no frontier tiles
      ownedTiles: [ownedTown],
      tilesByKey: new Map([["5,5", ownedTown]]),
      clientSeq: 3,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    // No frontier → BUILD_ECONOMY is now the best option
    expect(result.command?.type).toBe("BUILD_ECONOMIC_STRUCTURE");
  });

  // ── Fort / defense ───────────────────────────────────────────────────────

  it("builds a fort when enemies crowd the frontier and masonry is available", () => {
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

    expect(result.command?.type).toBe("BUILD_FORT");
  });

  // ── active_lock bypass (shared with GOAP path) ───────────────────────────

  it("respects active_lock even when utility is enabled", () => {
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
});
