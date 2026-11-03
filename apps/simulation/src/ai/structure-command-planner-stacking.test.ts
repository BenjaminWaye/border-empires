import { describe, expect, it } from "vitest";

import type { EconomicStructureType } from "@border-empires/shared";
import type { NeedVector } from "./build/build-need-vector.js";
import {
  chooseBestEconomicBuild,
  type StructurePlannerPlayer,
  type StructurePlannerTile
} from "./structure-command-planner.js";

// Regression for docs/ai-economic-synergy-plan.md Phase 1: the planner skipped
// every type a town already hosted, so it never built a 2nd Manufactory,
// Ancillary Depot or Aether Condenser even though the runtime lets those
// stack (structureStacksPerTown). Singleton types must still be skipped.

const tile = (x: number, y: number, overrides: Partial<StructurePlannerTile> = {}): StructurePlannerTile => ({
  x,
  y,
  terrain: "LAND",
  ...overrides
});

const PLAYER: StructurePlannerPlayer = {
  id: "ai-1",
  points: 10_000,
  manpower: 10_000,
  techIds: ["trade", "pottery", "coinage", "organized-supply", "crystal-lattices"],
  strategicResources: { FOOD: 1_000 },
  settledTileCount: 10,
  townCount: 1,
  incomePerMinute: 20
};

const ZERO_NEED_VECTOR: NeedVector = {
  MANPOWER_THROUGHPUT: 0,
  MANPOWER_CEILING: 0,
  FOOD_SLOTS: 0,
  TITANIUM_SLOTS: 0,
  UMBRITE_SLOTS: 0,
  CRYSTAL_SLOTS: 0,
  GOLD: 0,
  DEFENSE: 0,
  OFFENSE: 0,
  VICTORY: 0
};

// Town at (10,10) with one existing support building at (11,9), one open
// SETTLED support tile at (9,10), and the rest of the ring FRONTIER.
// Coordinates kept positive to avoid world-wrap key mismatches.
const townWithExisting = (existingType: EconomicStructureType) => {
  const town = tile(10, 10, {
    ownerId: "ai-1",
    ownershipState: "SETTLED",
    town: { populationTier: "TOWN", supportCurrent: 1, supportMax: 3 }
  });
  const existing = tile(11, 9, {
    ownerId: "ai-1",
    ownershipState: "SETTLED",
    economicStructure: { ownerId: "ai-1", type: existingType, status: "active" }
  });
  const open = tile(9, 10, { ownerId: "ai-1", ownershipState: "SETTLED" });
  const frontier = [[10, 9], [9, 9], [9, 11], [10, 11], [11, 11], [11, 10]].map(([x, y]) =>
    tile(x!, y!, { ownerId: "ai-1", ownershipState: "FRONTIER" })
  );
  const all = [town, existing, open, ...frontier];
  const tilesByKey = new Map<string, StructurePlannerTile>(all.map((t) => [`${t.x},${t.y}`, t] as const));
  return { town, all, tilesByKey };
};

describe("chooseBestEconomicBuild — per-town stacking", () => {
  it("proposes a 2nd Manufactory at a town that already has one", () => {
    const { town, all, tilesByKey } = townWithExisting("MANUFACTORY");
    const result = chooseBestEconomicBuild(PLAYER, all, tilesByKey);
    expect(result?.tile).toBe(town);
    expect(result?.structureType).toBe("MANUFACTORY");
  });

  it("proposes a 2nd Ancillary Depot at a town that already has one when manpower is pinned at cap", () => {
    const { town, all, tilesByKey } = townWithExisting("ANCILLARY_DEPOT");
    const result = chooseBestEconomicBuild(PLAYER, all, tilesByKey, all, { ...ZERO_NEED_VECTOR, MANPOWER_CEILING: 1 });
    expect(result?.tile).toBe(town);
    expect(result?.structureType).toBe("ANCILLARY_DEPOT");
  });

  it("proposes a 2nd Aether Condenser at a town that already has one when crystal slots are short", () => {
    const { town, all, tilesByKey } = townWithExisting("AETHER_CONDENSER");
    const result = chooseBestEconomicBuild(PLAYER, all, tilesByKey, all, { ...ZERO_NEED_VECTOR, CRYSTAL_SLOTS: 1 });
    expect(result?.tile).toBe(town);
    expect(result?.structureType).toBe("AETHER_CONDENSER");
  });

  it("still never proposes a 2nd copy of a one-per-town type", () => {
    // Ancillary Factory (score 160 at full MANPOWER_THROUGHPUT need) outscores
    // Manufactory (54), but the town already has one and the runtime would
    // reject a duplicate, so the stacking Manufactory must win instead.
    const { town, all, tilesByKey } = townWithExisting("ANCILLARY_FACTORY");
    const player: StructurePlannerPlayer = { ...PLAYER, techIds: [...(PLAYER.techIds ?? []), "remade-concordat"] };
    const result = chooseBestEconomicBuild(player, all, tilesByKey, all, { ...ZERO_NEED_VECTOR, MANPOWER_THROUGHPUT: 1 });
    expect(result?.tile).toBe(town);
    expect(result?.structureType).toBe("MANUFACTORY");
  });
});
