import { describe, expect, it } from "vitest";
import { planAutomationCommand } from "./automation-command-planner.js";

const tile = (x: number, y: number, overrides: Record<string, unknown> = {}) => ({
  x, y, terrain: "LAND" as const, ...overrides
});

describe("automation action admission", () => {
  it("classifies a reach-locked frontier without emitting a command", () => {
    const frontier = tile(10, 10, { ownerId: "ai-1", ownershipState: "FRONTIER" });
    const sea = tile(11, 10, { terrain: "SEA" });
    const result = planAutomationCommand({
      playerId: "ai-1", points: 500, manpower: 500, hasActiveLock: false,
      activeDevelopmentProcessCount: 1, frontierTiles: [frontier], ownedTiles: [frontier],
      tilesByKey: new Map([["10,10", frontier], ["11,10", sea]]),
      reachLookup: { isInReach: () => false }, clientSeq: 1, issuedAt: 1000, sessionPrefix: "ai-runtime"
    });
    expect(result.command).toBeUndefined();
    expect(result.diagnostic.noCommandReason).toBe("BLOCKED_NO_REACHABLE_BEACON_SITE");
  });

  it("turns INSUFFICIENT_SLOT into one reversible FOOD-slot recovery command", () => {
    const town = tile(0, 0, {
      ownerId: "ai-1", ownershipState: "SETTLED", town: { populationTier: "TOWN" },
      economicStructure: { ownerId: "ai-1", type: "GRANARY", status: "active" }
    });
    const result = planAutomationCommand({
      playerId: "ai-1", points: 500, manpower: 500, hasActiveLock: false,
      activeDevelopmentProcessCount: 0, frontierTiles: [], buildCandidateTiles: [town], ownedTiles: [town],
      tilesByKey: new Map([["0,0", town]]), slotSupplyByResource: { FOOD: 1 }, slotDemandByResource: { FOOD: 1 },
      blockedActionKeys: new Map([["BUILD_ECONOMIC_STRUCTURE:0,0", "INSUFFICIENT_SLOT"]]),
      decisionCooldowns: { BUILD_ECONOMY: true }, clientSeq: 1, issuedAt: 1000, sessionPrefix: "ai-runtime"
    });
    expect(result.command).toMatchObject({ type: "SET_CONVERTER_STRUCTURE_ENABLED", payloadJson: JSON.stringify({ x: 0, y: 0, enabled: false }) });
  });
});
