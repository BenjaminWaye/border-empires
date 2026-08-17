import { describe, expect, it } from "vitest";

import { planAutomationCommand } from "./automation-command-planner.js";

// Extracted from automation-command-planner.test.ts, which is already over the
// repo's 500-line source cap (scripts/check-file-line-limits.mjs) and must not
// grow. BUILD_DEFENSE reachability is a self-contained concern, so it gets its
// own file rather than being wedged into the oversized one.

const makeTile = (
  x: number,
  y: number,
  overrides: Partial<{
    terrain: "LAND" | "SEA" | "MOUNTAIN";
    ownerId: string;
    ownershipState: string;
    resource: string;
    town: {
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

describe("automation command planner — BUILD_DEFENSE reachability", () => {
  // BUILD_DEFENSE occupies a narrow window, and this fixture has to sit inside
  // it deliberately. A FORT costs 300 manpower, but MUSTER only needs
  // ATTACK_MANPOWER_MIN (60), and scoreMuster's considerations beat
  // scoreBuildDefense's pressure logistic whenever a weak enemy border exists —
  // so at any manpower high enough to afford the fort, SET_MUSTER wins instead.
  // Stalemating the two enemy tiles clears hasWeakEnemyBorder, vetoing MUSTER
  // and leaving BUILD_DEFENSE as the reachable class. That is the real
  // "fortify what you cannot break through" niche; see
  // docs/ai-structure-building-rewrite-plan.md §13.6.
  it("builds a fort on an exposed settled core tile when the crowding enemies are stalemated", () => {
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
      manpower: 300,
      techIds: ["masonry"],
      strategicResources: { TITANIUM: 60 },
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
      sessionPrefix: "ai-runtime",
      attackStalemateTargetTileKeys: new Set(["9,8", "8,9"])
    });

    expect(result.command).toMatchObject({
      type: "BUILD_FORT",
      payloadJson: JSON.stringify({ x: 8, y: 8 })
    });
  });

  // The affordability half of the same gate: identical fixture, manpower one
  // short of FORT_TIER_LADDER.FORT's 300. Before the manpower gate landed in
  // structure-command-planner.ts this still emitted BUILD_FORT, which the
  // runtime then rejected with INSUFFICIENT_MANPOWER every tick.
  it("does not propose a fort it cannot pay the manpower for", () => {
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
      manpower: 299,
      techIds: ["masonry"],
      strategicResources: { TITANIUM: 60 },
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
      sessionPrefix: "ai-runtime",
      attackStalemateTargetTileKeys: new Set(["9,8", "8,9"])
    });

    expect(result.command?.type).not.toBe("BUILD_FORT");
  });
});
