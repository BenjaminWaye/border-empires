import { describe, expect, it } from "vitest";

import { planAutomationCommand } from "./automation-command-planner.js";
import {
  chooseBestFortBuild,
  chooseBestSiegeOutpostBuild,
  type StructurePlannerTile
} from "./structure-command-planner.js";

const tile = (x: number, y: number, overrides: Partial<StructurePlannerTile> = {}): StructurePlannerTile => ({
  x,
  y,
  terrain: "LAND",
  ...overrides
});

describe("structure command planner", () => {
  it("uses cached siege outpost counts for affordability before scanning candidate sites", () => {
    const candidate = tile(0, 0, {
      ownerId: "ai-1",
      ownershipState: "SETTLED",
      town: { populationTier: "TOWN" }
    });
    const enemy = tile(1, 0, {
      ownerId: "enemy-1",
      town: { populationTier: "TOWN" }
    });
    const tilesByKey = new Map([
      ["0,0", candidate],
      ["1,0", enemy]
    ]);

    expect(chooseBestSiegeOutpostBuild({
      id: "ai-1",
      points: 1_000,
      techIds: ["leatherworking"],
      strategicResources: { SUPPLY: 45 }
    }, [candidate], tilesByKey, [candidate])).toBe(candidate);
    expect(chooseBestSiegeOutpostBuild({
      id: "ai-1",
      points: 1_000,
      techIds: ["leatherworking"],
      strategicResources: { SUPPLY: 45 },
      ownedStructureCounts: { SIEGE_OUTPOST: 3 }
    }, [candidate], tilesByKey, [candidate])).toBeUndefined();
  });

  it("uses cached fort counts for affordability before scanning candidate sites", () => {
    const candidate = tile(0, 0, {
      ownerId: "ai-1",
      ownershipState: "SETTLED",
      town: { populationTier: "TOWN" }
    });
    const enemy = tile(1, 0, { ownerId: "enemy-1" });
    const tilesByKey = new Map([
      ["0,0", candidate],
      ["1,0", enemy]
    ]);

    expect(chooseBestFortBuild({
      id: "ai-1",
      points: 1_000,
      techIds: ["masonry"],
      strategicResources: { IRON: 45 }
    }, [candidate], tilesByKey, [candidate])).toBe(candidate);
    expect(chooseBestFortBuild({
      id: "ai-1",
      points: 1_000,
      techIds: ["masonry"],
      strategicResources: { IRON: 45 },
      ownedStructureCounts: { FORT: 2 }
    }, [candidate], tilesByKey, [candidate])).toBeUndefined();
  });

  it("counts structures outside buildCandidateTiles when planning structure affordability", () => {
    const candidate = tile(0, 0, {
      ownerId: "ai-1",
      ownershipState: "SETTLED",
      town: { populationTier: "TOWN" }
    });
    const frontier = tile(0, 1, { ownerId: "ai-1", ownershipState: "FRONTIER" });
    const enemy = tile(1, 0, { ownerId: "enemy-1", town: { populationTier: "TOWN" } });
    const frontierEnemy = tile(1, 1, { ownerId: "enemy-1", town: { populationTier: "TOWN" } });
    const existingOutposts = [2, 3, 4].map((x) => tile(x, 0, {
      ownerId: "ai-1",
      ownershipState: "SETTLED",
      siegeOutpost: { ownerId: "ai-1", status: "active" }
    }));
    const tilesByKey = new Map([
      ["0,0", candidate],
      ["0,1", frontier],
      ["1,0", enemy],
      ["1,1", frontierEnemy],
      ...existingOutposts.map((existing) => [`${existing.x},0`, existing] as const)
    ]);

    const result = planAutomationCommand({
      playerId: "ai-1",
      points: 1_000,
      manpower: 1_000,
      techIds: ["leatherworking"],
      strategicResources: { SUPPLY: 45 },
      settledTileCount: 5,
      townCount: 1,
      incomePerMinute: 12,
      hasActiveLock: false,
      activeDevelopmentProcessCount: 0,
      frontierTiles: [frontier],
      buildCandidateTiles: [candidate],
      ownedTiles: [candidate, frontier, ...existingOutposts],
      tilesByKey,
      clientSeq: 1,
      issuedAt: 1_000,
      sessionPrefix: "ai-runtime",
      attackStalemateTargetTileKeys: new Set(["1,1"])
    });

    expect(result.command?.type).not.toBe("BUILD_SIEGE_OUTPOST");
  });
});
