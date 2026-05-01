import { describe, expect, it } from "vitest";

import { chooseAutomationPreplanCommand } from "./ai-preplan-command.js";

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
      name?: string;
      type?: "MARKET" | "FARMING";
      populationTier?: "SETTLEMENT" | "TOWN" | "CITY" | "GREAT_CITY" | "METROPOLIS";
    } | null;
  }> = {}
) => ({
  x,
  y,
  terrain: "LAND" as const,
  ...overrides
});

describe("automation preplan command", () => {
  it("collects visible yield during an active lock instead of idling", () => {
    const town = makeTile(0, 0, {
      ownerId: "ai-1",
      ownershipState: "SETTLED",
      town: { name: "Locktown", populationTier: "TOWN" }
    });

    const result = chooseAutomationPreplanCommand({
      playerId: "ai-1",
      points: 500,
      techIds: [],
      domainIds: [],
      strategicResources: {},
      settledTileCount: 1,
      townCount: 1,
      incomePerMinute: 2,
      hasActiveLock: true,
      ownedTiles: [town],
      clientSeq: 1,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    expect(result.command).toMatchObject({
      type: "COLLECT_VISIBLE",
      payloadJson: "{}"
    });
  });

  it("collects visible yield before frontier spam when the best tech is still unaffordable", () => {
    const town = makeTile(0, 0, {
      ownerId: "ai-1",
      ownershipState: "SETTLED",
      town: { name: "Seed", populationTier: "SETTLEMENT" }
    });

    const result = chooseAutomationPreplanCommand({
      playerId: "ai-1",
      points: 1_500,
      techIds: [],
      domainIds: [],
      strategicResources: { FOOD: 80, CRYSTAL: 40 },
      settledTileCount: 3,
      townCount: 1,
      incomePerMinute: 1,
      hasActiveLock: false,
      ownedTiles: [town],
      clientSeq: 2,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    expect(result.command).toMatchObject({
      type: "COLLECT_VISIBLE",
      payloadJson: "{}"
    });
  });

  it("chooses the best affordable tech when no collection recovery is needed", () => {
    const town = makeTile(0, 0, {
      ownerId: "ai-1",
      ownershipState: "SETTLED",
      town: { name: "Core", populationTier: "TOWN" }
    });

    const result = chooseAutomationPreplanCommand({
      playerId: "ai-1",
      points: 2_500,
      techIds: [],
      domainIds: [],
      strategicResources: {},
      settledTileCount: 1,
      townCount: 1,
      incomePerMinute: 6,
      hasActiveLock: false,
      ownedTiles: [town],
      clientSeq: 3,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    expect(result.command).toMatchObject({
      type: "CHOOSE_TECH",
      payloadJson: JSON.stringify({ techId: "toolmaking" })
    });
  });

  it("chooses the best affordable domain after the enabling tech is owned", () => {
    const town = makeTile(0, 0, {
      ownerId: "ai-1",
      ownershipState: "SETTLED",
      town: { name: "Harborview", populationTier: "TOWN" }
    });
    const dock = makeTile(1, 0, {
      ownerId: "ai-1",
      ownershipState: "SETTLED",
      dockId: "dock-a"
    });

    const result = chooseAutomationPreplanCommand({
      playerId: "ai-1",
      points: 7_000,
      techIds: ["toolmaking", "trade"],
      domainIds: [],
      strategicResources: { CRYSTAL: 120 },
      settledTileCount: 2,
      townCount: 1,
      incomePerMinute: 8,
      hasActiveLock: false,
      ownedTiles: [town, dock],
      clientSeq: 4,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    expect(result.command).toMatchObject({
      type: "CHOOSE_DOMAIN",
      payloadJson: JSON.stringify({ domainId: "mercantile-charter" })
    });
  });
});
