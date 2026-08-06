import { describe, expect, it } from "vitest";
import { DEVELOPMENT_PROCESS_LIMIT } from "@border-empires/shared";

import { planAutomationCommand } from "./automation-command-planner.js";

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
    };
  }> = {}
) => ({
  x,
  y,
  terrain: "LAND" as const,
  ...overrides
});

describe("automation planner economy gate", () => {
  it("builds an economic structure when income is weak and a good settled resource tile exists", () => {
    const ownedTown = makeTile(5, 5, {
      ownerId: "ai-1",
      ownershipState: "SETTLED",
      town: { type: "MARKET", name: "Town", populationTier: "TOWN" }
    });
    // MARKET is a town-support structure — the runtime places it on an open,
    // SETTLED neighbor tile assigned to this town (resolveTownSupportTarget),
    // never on the town tile itself. A fixture with no such neighbor is
    // unrealistic and previously masked the AI proposing commands the
    // runtime always rejects (see structure-command-planner.test.ts for the
    // dedicated regression test on chooseBestEconomicBuild itself).
    const openSupportTile = makeTile(6, 5, { ownerId: "ai-1", ownershipState: "SETTLED" });
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
      ownedTiles: [ownedTown, openSupportTile],
      tilesByKey: new Map([
        ["5,5", ownedTown],
        ["6,5", openSupportTile]
      ]),
      clientSeq: 3,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    expect(result.command).toMatchObject({
      type: "BUILD_ECONOMIC_STRUCTURE",
      payloadJson: JSON.stringify({ x: 5, y: 5, structureType: "MARKET" })
    });
  });

  it("treats local reserved development slots as occupied before choosing economy", () => {
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
      activeDevelopmentProcessCount: DEVELOPMENT_PROCESS_LIMIT - 1,
      reservedDevelopmentSlots: 1,
      frontierTiles: [],
      ownedTiles: [ownedTown],
      tilesByKey: new Map([["5,5", ownedTown]]),
      clientSeq: 31,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    expect(result.command).toBeUndefined();
    expect(result.diagnostic.noCommandReason).toBe("development_process_limit");
  });

  it("skips economy build when activeDevelopmentProcessCount is already at the limit", () => {
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
      activeDevelopmentProcessCount: DEVELOPMENT_PROCESS_LIMIT,
      frontierTiles: [],
      ownedTiles: [ownedTown],
      tilesByKey: new Map([["5,5", ownedTown]]),
      clientSeq: 33,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    expect(result.command).toBeUndefined();
    expect(result.diagnostic.noCommandReason).toBe("development_process_limit");
  });

  it("prefers an available attack over filling an open economy slot", () => {
    const ownedTown = makeTile(5, 5, {
      ownerId: "ai-1",
      ownershipState: "SETTLED",
      town: { type: "MARKET", name: "Town", populationTier: "TOWN" }
    });
    const enemy = makeTile(6, 5, { ownerId: "enemy-1" });
    const result = planAutomationCommand({
      playerId: "ai-1",
      points: 5_000,
      manpower: 100,
      techIds: ["trade"],
      strategicResources: { FOOD: 60 },
      settledTileCount: 6,
      townCount: 1,
      incomePerMinute: 0,
      hasActiveLock: false,
      activeDevelopmentProcessCount: 0,
      frontierTiles: [ownedTown],
      hotFrontierTiles: [ownedTown],
      strategicFrontierTiles: [ownedTown],
      ownedTiles: [ownedTown],
      buildCandidateTiles: [ownedTown],
      tilesByKey: new Map([
        ["5,5", ownedTown],
        ["6,5", enemy]
      ]),
      clientSeq: 32,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    // Attack path wins over the economy slot; under the muster system with no
    // muster staged yet, that means SET_MUSTER (staging manpower) rather than
    // a direct ATTACK — see automation-command-planner-utility-integration.test.ts
    // for the identical reasoning.
    expect(result.command?.type).toBe("SET_MUSTER");
  });
});
