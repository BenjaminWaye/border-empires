import { describe, expect, it } from "vitest";

import { planAutomationCommand } from "./automation-command-planner.js";
import {
  chooseBestEconomicBuild,
  chooseBestFortBuild,
  chooseBestSiegeOutpostBuild,
  type StructurePlannerPlayer,
  type StructurePlannerTile
} from "./structure-command-planner.js";

const tile = (x: number, y: number, overrides: Partial<StructurePlannerTile> = {}): StructurePlannerTile => ({
  x,
  y,
  terrain: "LAND",
  ...overrides
});

const ECONOMIC_BUILD_PLAYER: StructurePlannerPlayer = {
  id: "ai-1",
  points: 10_000,
  techIds: ["trade", "pottery", "coinage"],
  strategicResources: { FOOD: 1_000 },
  settledTileCount: 10,
  townCount: 1,
  incomePerMinute: 20
};

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

describe("chooseBestEconomicBuild — town support tile availability", () => {
  // Regression: production staging showed BUILD_ECONOMIC_STRUCTURE rejected
  // 1108/1109 attempts (99.9%). chooseBestEconomicBuild proposed MARKET/BANK/
  // GRANARY whenever a town's supportCurrent < supportMax, without checking
  // whether a physical open SETTLED neighbor tile actually existed to host
  // the structure. The runtime places these on an adjacent support tile
  // (resolveTownSupportTarget), not the town tile itself, and rejects with
  // "needs an open support tile next to this town" when none exists — which
  // silently burns the AI's action budget every tick it re-proposes the same
  // doomed command instead of falling through to something executable.
  const town = tile(0, 0, {
    ownerId: "ai-1",
    ownershipState: "SETTLED",
    town: { populationTier: "TOWN", supportCurrent: 0, supportMax: 2 }
  });

  it("does not propose a town-support structure when every neighbor is FRONTIER (no open SETTLED support tile)", () => {
    // All 8 neighbors owned but still FRONTIER — matches the low
    // settled-tile-ratio empires observed stuck in production (e.g. 175
    // settled out of 1667 owned tiles).
    const frontierNeighbors = [
      [-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]
    ].map(([dx, dy]) => tile(dx, dy, { ownerId: "ai-1", ownershipState: "FRONTIER" }));
    const tilesByKey = new Map<string, StructurePlannerTile>([
      ["0,0", town],
      ...frontierNeighbors.map((n) => [`${n.x},${n.y}`, n] as const)
    ]);

    const result = chooseBestEconomicBuild(ECONOMIC_BUILD_PLAYER, [town, ...frontierNeighbors], tilesByKey);
    expect(result).toBeUndefined();
  });

  it("proposes a town-support structure when an open, correctly-assigned SETTLED neighbor exists", () => {
    const openSupportTile = tile(1, 0, { ownerId: "ai-1", ownershipState: "SETTLED" });
    const tilesByKey = new Map<string, StructurePlannerTile>([
      ["0,0", town],
      ["1,0", openSupportTile]
    ]);

    const result = chooseBestEconomicBuild(ECONOMIC_BUILD_PLAYER, [town, openSupportTile], tilesByKey);
    expect(result).toBeDefined();
    expect(result?.tile).toBe(town);
    expect(["MARKET", "BANK", "GRANARY"]).toContain(result?.structureType);
  });

  it("does not re-propose a structure type the town already has, even when it outscores the genuinely missing type", () => {
    // Regression: staging showed the same "273,30:GRANARY" candidate proposed
    // and rejected ("town already has granary") every rejection-cooldown
    // cycle indefinitely. supportCurrent < supportMax only means the town
    // wants MORE support capacity overall — it doesn't mean it's missing
    // THIS specific type. The runtime's economicStructureForSupportedTown
    // check catches the duplicate; chooseBestEconomicBuild must too.
    //
    // The town already has BANK (score 66, the highest-scoring candidate
    // here) and GRANARY (score 20) — only MARKET (score 54) is genuinely
    // missing. Without the fix, BANK's higher score would win even though
    // the town already has one; asserting "not GRANARY" alone wouldn't
    // catch that, since BANK naturally outscores GRANARY regardless of the
    // fix — the assertion must pin the winner to MARKET specifically.
    //
    // Coordinates kept positive and away from 0 — negative offsets wrap
    // around WORLD_WIDTH/WORLD_HEIGHT (450x450), which would silently look
    // up the wrong tile key and mask this exact class of bug.
    const town2 = tile(10, 10, {
      ownerId: "ai-1",
      ownershipState: "SETTLED",
      town: { populationTier: "TOWN", supportCurrent: 0, supportMax: 3 }
    });
    const existingBank = tile(11, 10, {
      ownerId: "ai-1",
      ownershipState: "SETTLED",
      economicStructure: { ownerId: "ai-1", type: "BANK", status: "active" }
    });
    const existingGranary = tile(11, 9, {
      ownerId: "ai-1",
      ownershipState: "SETTLED",
      economicStructure: { ownerId: "ai-1", type: "GRANARY", status: "active" }
    });
    const openSupportTile = tile(9, 10, { ownerId: "ai-1", ownershipState: "SETTLED" });
    const frontierNeighbors = [
      [10, 9], [9, 9], [9, 11], [10, 11], [11, 11]
    ].map(([x, y]) => tile(x, y, { ownerId: "ai-1", ownershipState: "FRONTIER" }));
    const tilesByKey = new Map<string, StructurePlannerTile>([
      ["10,10", town2],
      ["11,10", existingBank],
      ["11,9", existingGranary],
      ["9,10", openSupportTile],
      ...frontierNeighbors.map((n) => [`${n.x},${n.y}`, n] as const)
    ]);

    const result = chooseBestEconomicBuild(
      ECONOMIC_BUILD_PLAYER,
      [town2, existingBank, existingGranary, openSupportTile, ...frontierNeighbors],
      tilesByKey
    );
    expect(result?.structureType).toBe("MARKET");
  });

  it("does not propose a town-support structure when the only SETTLED neighbor already has a structure", () => {
    const occupiedNeighbor = tile(1, 0, {
      ownerId: "ai-1",
      ownershipState: "SETTLED",
      fort: { ownerId: "ai-1", status: "active" }
    });
    const frontierNeighbors = [
      [-1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1], [1, 1]
    ].map(([dx, dy]) => tile(dx, dy, { ownerId: "ai-1", ownershipState: "FRONTIER" }));
    const tilesByKey = new Map<string, StructurePlannerTile>([
      ["0,0", town],
      ["1,0", occupiedNeighbor],
      ...frontierNeighbors.map((n) => [`${n.x},${n.y}`, n] as const)
    ]);

    const result = chooseBestEconomicBuild(
      ECONOMIC_BUILD_PLAYER,
      [town, occupiedNeighbor, ...frontierNeighbors],
      tilesByKey
    );
    expect(result).toBeUndefined();
  });
});
