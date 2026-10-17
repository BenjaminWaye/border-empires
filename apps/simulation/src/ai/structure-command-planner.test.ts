import { describe, expect, it } from "vitest";

import { planAutomationCommand } from "./automation-command-planner.js";
import {
  chooseBestEconomicBuild,
  chooseBestFortBuild,
  chooseBestSiegeBatteryBuild,
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
  // §24.5: economyWeak now reads manpower, not incomePerMinute (buildings
  // cost manpower, §4.1) — set high enough to keep this fixture's original
  // "healthy economy" intent (well above Math.max(40, settledTileCount*6)).
  manpower: 10_000,
  techIds: ["trade", "pottery", "coinage"],
  strategicResources: { FOOD: 1_000 },
  settledTileCount: 10,
  townCount: 1,
  incomePerMinute: 20
};

describe("structure command planner", () => {
  it("proposes a siege battery when affordable, regardless of existing owned count (runtime never scales SIEGE_BATTERY gold/resource cost by count)", () => {
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

    expect(chooseBestSiegeBatteryBuild({
      id: "ai-1",
      points: 1_000,
      // Ample manpower throughout this file's fixtures: these cases assert
      // gold/strategic-resource and tier affordability, so manpower is held
      // well clear of the SIEGE/FORT ladder costs to keep it out of the way.
      // Manpower gating itself is covered by its own cases at the bottom.
      manpower: 1_000,
      techIds: ["leatherworking"],
      strategicResources: { UMBRITE: 45 }
    }, [candidate], tilesByKey, [candidate])).toBe(candidate);
    // 3 existing outposts must not affect affordability — matches
    // runtime-structure-command-handlers.ts, which always charges the flat
    // SIEGE_TIER_LADDER cost for the player's best available tier, never a
    // count-scaled cost.
    expect(chooseBestSiegeBatteryBuild({
      id: "ai-1",
      points: 1_000,
      manpower: 1_000,
      techIds: ["leatherworking"],
      strategicResources: { UMBRITE: 45 },
      ownedStructureCounts: { SIEGE_BATTERY: 3 }
    }, [candidate], tilesByKey, [candidate])).toBe(candidate);
  });

  it("gates siege battery proposal on the tier the player will actually build, not the flat base-tier cost", () => {
    const candidate = tile(0, 0, {
      ownerId: "ai-1",
      ownershipState: "SETTLED",
      town: { populationTier: "TOWN" }
    });
    const enemy = tile(1, 0, { ownerId: "enemy-1", town: { populationTier: "TOWN" } });
    const tilesByKey = new Map([
      ["0,0", candidate],
      ["1,0", enemy]
    ]);
    const basePlayer = { id: "ai-1", points: 1_000, manpower: 1_000, techIds: ["leatherworking", "siegecraft"] };

    // The upgraded tier needs UMBRITE and TITANIUM capacity.
    expect(chooseBestSiegeBatteryBuild(
      { ...basePlayer, slotSupplyByResource: { UMBRITE: 1, TITANIUM: 0 }, slotDemandByResource: {} },
      [candidate],
      tilesByKey,
      [candidate]
    )).toBeUndefined();

    // With enough slots, zero retired stockpile balances are legal.
    expect(chooseBestSiegeBatteryBuild(
      { ...basePlayer, points: 1_800, strategicResources: {}, slotSupplyByResource: { UMBRITE: 10, TITANIUM: 10 }, slotDemandByResource: {} },
      [candidate],
      tilesByKey,
      [candidate]
    )).toBe(candidate);
  });

  it("does not propose a siege battery when supply is insufficient for the player's actual tier, even with existing outposts elsewhere", () => {
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
      siegeBattery: { ownerId: "ai-1", status: "active" }
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
      // No UMBRITE slot: choose something else instead of submitting a
      // doomed build, regardless of retired stockpile balances.
      strategicResources: { UMBRITE: 0 },
      slotSupplyByResource: { UMBRITE: 0 }, slotDemandByResource: { UMBRITE: 0 },
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

    expect(result.command?.type).not.toBe("BUILD_SIEGE_BATTERY");
  });
});

// Regression: build gold costs are globally zeroed (structure-costs.ts §12) so
// manpower is the real build cost, but no selector in structure-command-planner
// checked it — every BUILD_* the AI proposed while manpower-poor was rejected by
// the runtime with INSUFFICIENT_MANPOWER, burning the tick's action budget and a
// rejection cooldown each cycle. Same "authoritative gate" shape already applied
// to EXPAND/ATTACK via hasAnyExpandCandidate/hasAnyAttackCandidate.
// See docs/ai-structure-building-rewrite-plan.md §1.2 / §11 Phase 0.
describe("structure command planner — manpower affordability", () => {
  const candidate = tile(0, 0, {
    ownerId: "ai-1",
    ownershipState: "SETTLED",
    town: { populationTier: "TOWN" }
  });
  const enemy = tile(1, 0, { ownerId: "enemy-1", town: { populationTier: "TOWN" } });
  const tilesByKey = new Map([
    ["0,0", candidate],
    ["1,0", enemy]
  ]);

  it("does not propose a fort the player cannot pay the manpower for", () => {
    // FORT_TIER_LADDER.FORT costs 300 manpower; gold and titanium are ample so
    // manpower is unambiguously the only thing failing.
    const base = {
      id: "ai-1",
      points: 10_000,
      techIds: ["masonry"],
      strategicResources: { TITANIUM: 1_000 }
    };

    expect(chooseBestFortBuild(
      { ...base, manpower: 299 },
      [candidate],
      tilesByKey,
      [candidate]
    )).toBeUndefined();

    expect(chooseBestFortBuild(
      { ...base, manpower: 300 },
      [candidate],
      tilesByKey,
      [candidate]
    )).toBe(candidate);
  });

  it("does not propose a siege battery the player cannot pay the manpower for", () => {
    // SIEGE_TIER_LADDER.SIEGE_BATTERY costs 60 manpower.
    const base = {
      id: "ai-1",
      points: 10_000,
      techIds: ["leatherworking"],
      strategicResources: { UMBRITE: 1_000 }
    };

    expect(chooseBestSiegeBatteryBuild(
      { ...base, manpower: 59 },
      [candidate],
      tilesByKey,
      [candidate]
    )).toBeUndefined();

    expect(chooseBestSiegeBatteryBuild(
      { ...base, manpower: 60 },
      [candidate],
      tilesByKey,
      [candidate]
    )).toBe(candidate);
  });

  it("degrades to a cheaper affordable economic structure rather than proposing an unaffordable one", () => {
    // A well-fed TOWN below its support cap offers two candidates: MINTWORKS
    // (150 manpower, score 54) and INCUBATION_ENGINE (80 manpower, score 20). The gate is
    // applied per-candidate *before* the best-score pick, so a player who can
    // afford only the cheaper one still gets a usable build instead of falling
    // through to WAIT — the AI degrades rather than stalling.
    const town = tile(0, 0, {
      ownerId: "ai-1",
      ownershipState: "SETTLED",
      town: { populationTier: "TOWN", supportCurrent: 0, supportMax: 2 }
    });
    const openSupportTile = tile(1, 0, { ownerId: "ai-1", ownershipState: "SETTLED" });
    const townTilesByKey = new Map<string, StructurePlannerTile>([
      ["0,0", town],
      ["1,0", openSupportTile]
    ]);
    const base = {
      id: "ai-1",
      points: 10_000,
      techIds: ["trade", "pottery"],
      // Comfortably above foodCoverageLow's max(24, townCount*12), so MINTWORKS
      // outscores INCUBATION_ENGINE and the fallback below is driven purely by manpower.
      strategicResources: { FOOD: 1_000 },
      settledTileCount: 10,
      townCount: 1,
      incomePerMinute: 20
    };
    const chooseAt = (manpower: number) => chooseBestEconomicBuild(
      { ...base, manpower },
      [town, openSupportTile],
      townTilesByKey
    );

    // Below INCUBATION_ENGINE's 80 — nothing is affordable, so nothing is proposed.
    expect(chooseAt(79)).toBeUndefined();
    // Affords INCUBATION_ENGINE but not MINTWORKS — takes the cheaper one.
    expect(chooseAt(80)?.structureType).toBe("INCUBATION_ENGINE");
    expect(chooseAt(149)?.structureType).toBe("INCUBATION_ENGINE");
    // Affords MINTWORKS — the higher-scoring candidate wins again.
    expect(chooseAt(150)?.structureType).toBe("MINTWORKS");
  });

});

describe("chooseBestEconomicBuild — town support tile availability", () => {
  // Regression: production staging showed BUILD_ECONOMIC_STRUCTURE rejected
  // 1108/1109 attempts (99.9%). chooseBestEconomicBuild proposed MINTWORKS/
  // INCUBATION_ENGINE whenever a town's supportCurrent < supportMax, without checking
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
    expect(["MINTWORKS", "INCUBATION_ENGINE"]).toContain(result?.structureType);
  });

  it("does not re-propose a structure type the town already has, even when it outscores the genuinely missing type", () => {
    // Regression: staging showed the same "273,30:INCUBATION_ENGINE" candidate proposed
    // and rejected ("town already has incubation engine") every rejection-cooldown
    // cycle indefinitely. supportCurrent < supportMax only means the town
    // wants MORE support capacity overall — it doesn't mean it's missing
    // THIS specific type. The runtime's economicStructureForSupportedTown
    // check catches the duplicate; chooseBestEconomicBuild must too.
    //
    // The town already has INCUBATION_ENGINE (score 20) — only MINTWORKS (score 54) is
    // genuinely missing, so the fix must not re-propose INCUBATION_ENGINE.
    //
    // Coordinates kept positive and away from 0 — negative offsets wrap
    // around WORLD_WIDTH/WORLD_HEIGHT (450x450), which would silently look
    // up the wrong tile key and mask this exact class of bug.
    const town2 = tile(10, 10, {
      ownerId: "ai-1",
      ownershipState: "SETTLED",
      town: { populationTier: "TOWN", supportCurrent: 0, supportMax: 3 }
    });
    const existingIncubationEngine = tile(11, 9, {
      ownerId: "ai-1",
      ownershipState: "SETTLED",
      economicStructure: { ownerId: "ai-1", type: "INCUBATION_ENGINE", status: "active" }
    });
    const openSupportTile = tile(9, 10, { ownerId: "ai-1", ownershipState: "SETTLED" });
    const frontierNeighbors = [
      [10, 9], [9, 9], [9, 11], [10, 11], [11, 11], [11, 10]
    ].map(([x, y]) => tile(x, y, { ownerId: "ai-1", ownershipState: "FRONTIER" }));
    const tilesByKey = new Map<string, StructurePlannerTile>([
      ["10,10", town2],
      ["11,9", existingIncubationEngine],
      ["9,10", openSupportTile],
      ...frontierNeighbors.map((n) => [`${n.x},${n.y}`, n] as const)
    ]);

    const result = chooseBestEconomicBuild(
      ECONOMIC_BUILD_PLAYER,
      [town2, existingIncubationEngine, openSupportTile, ...frontierNeighbors],
      tilesByKey
    );
    expect(result?.structureType).toBe("MINTWORKS");
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
