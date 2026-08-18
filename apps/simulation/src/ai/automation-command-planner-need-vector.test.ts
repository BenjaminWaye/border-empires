import { describe, expect, it } from "vitest";

import { planAutomationCommand } from "./automation-command-planner.js";

// Phase 1 of docs/ai-structure-building-rewrite-plan.md (§9/§10.1): pins the
// wiring between AutomationPlannerInput's four new optional fields and the
// diagnostic's needVector. The deficit math itself is covered by
// build/build-need-vector.test.ts — this only checks the plumbing: present
// when all four inputs are supplied, absent otherwise, with no effect on the
// command that gets chosen (Phase 1 is read-only by design).

const makeTile = (
  x: number,
  y: number,
  overrides: Partial<{
    terrain: "LAND" | "SEA" | "MOUNTAIN";
    ownerId: string;
    ownershipState: string;
  }> = {}
) => ({
  x,
  y,
  terrain: "LAND" as const,
  ...overrides
});

const NEED_VECTOR_INPUTS = {
  manpowerCapacity: 1_000,
  manpowerRegenPerMinute: 2,
  slotSupplyByResource: { FOOD: 4 },
  slotDemandByResource: { FOOD: 2 }
};

describe("automation command planner — needVector wiring", () => {
  it("omits needVector when none of the optional inputs are supplied (every existing caller)", () => {
    const owned = makeTile(0, 0, { ownerId: "ai-1", ownershipState: "SETTLED" });
    const result = planAutomationCommand({
      playerId: "ai-1",
      points: 500,
      manpower: 10,
      settledTileCount: 1,
      townCount: 0,
      incomePerMinute: 0,
      hasActiveLock: false,
      activeDevelopmentProcessCount: 0,
      frontierTiles: [],
      ownedTiles: [owned],
      tilesByKey: new Map([["0,0", owned]]),
      clientSeq: 1,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    expect(result.diagnostic.needVector).toBeUndefined();
  });

  it("omits needVector when only some of the four optional inputs are supplied", () => {
    const owned = makeTile(0, 0, { ownerId: "ai-1", ownershipState: "SETTLED" });
    const result = planAutomationCommand({
      playerId: "ai-1",
      points: 500,
      manpower: 10,
      settledTileCount: 1,
      townCount: 0,
      incomePerMinute: 0,
      hasActiveLock: false,
      activeDevelopmentProcessCount: 0,
      frontierTiles: [],
      ownedTiles: [owned],
      tilesByKey: new Map([["0,0", owned]]),
      clientSeq: 1,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime",
      // Only two of the four — manpowerCapacity/manpowerRegenPerMinute missing.
      slotSupplyByResource: NEED_VECTOR_INPUTS.slotSupplyByResource,
      slotDemandByResource: NEED_VECTOR_INPUTS.slotDemandByResource
    });

    expect(result.diagnostic.needVector).toBeUndefined();
  });

  it("populates needVector with every NeedKey when all four optional inputs are supplied", () => {
    const owned = makeTile(0, 0, { ownerId: "ai-1", ownershipState: "SETTLED" });
    const result = planAutomationCommand({
      playerId: "ai-1",
      points: 500,
      manpower: 10,
      settledTileCount: 1,
      townCount: 0,
      incomePerMinute: 0,
      hasActiveLock: false,
      activeDevelopmentProcessCount: 0,
      frontierTiles: [],
      ownedTiles: [owned],
      tilesByKey: new Map([["0,0", owned]]),
      clientSeq: 1,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime",
      ...NEED_VECTOR_INPUTS
    });

    expect(result.diagnostic.needVector).toEqual({
      MANPOWER_THROUGHPUT: expect.any(Number),
      MANPOWER_CEILING: expect.any(Number),
      FOOD_SLOTS: expect.any(Number),
      TITANIUM_SLOTS: expect.any(Number),
      UMBRITE_SLOTS: expect.any(Number),
      CRYSTAL_SLOTS: expect.any(Number),
      GOLD: expect.any(Number),
      DEFENSE: expect.any(Number),
      OFFENSE: expect.any(Number),
      VICTORY: expect.any(Number)
    });
    // FOOD_SLOTS specifically: supply(4) covers demand(2) -> no deficit.
    expect(result.diagnostic.needVector?.FOOD_SLOTS).toBe(0);
  });

  it("does not change which command is chosen (Phase 1 is diagnostics-only)", () => {
    const owned = makeTile(5, 5, { ownerId: "ai-1", ownershipState: "SETTLED" });
    const neutral = makeTile(6, 5);
    const tilesByKey = new Map([
      ["5,5", owned],
      ["6,5", neutral]
    ]);
    const baseInput = {
      playerId: "ai-1",
      points: 500,
      manpower: 10,
      settledTileCount: 1,
      townCount: 0,
      incomePerMinute: 0,
      hasActiveLock: false,
      activeDevelopmentProcessCount: 0,
      frontierTiles: [owned],
      ownedTiles: [owned],
      tilesByKey,
      clientSeq: 1,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime" as const
    };

    const without = planAutomationCommand(baseInput);
    const withNeedVector = planAutomationCommand({ ...baseInput, ...NEED_VECTOR_INPUTS });

    expect(withNeedVector.command).toEqual(without.command);
  });
});
