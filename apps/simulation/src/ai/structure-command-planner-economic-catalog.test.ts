import { describe, expect, it } from "vitest";

import type { NeedVector } from "./build/build-need-vector.js";
import {
  chooseBestEconomicBuild,
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
  manpower: 10_000,
  techIds: ["trade", "pottery", "coinage"],
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

describe("chooseBestEconomicBuild — need-weighted catalog", () => {
  const TECH_FOR_CATALOG = ["irrigation", "civil-service", "organized-supply", "remade-concordat", "ledger-keeping", "workshops", "alchemy", "crystal-lattices"];

  it("does not propose any catalog type when no needVector is supplied (unchanged pre-catalog behavior)", () => {
    const plainLand = tile(5, 5, { ownerId: "ai-1", ownershipState: "SETTLED" });
    const tilesByKey = new Map<string, StructurePlannerTile>([["5,5", plainLand]]);

    const result = chooseBestEconomicBuild(
      { ...ECONOMIC_BUILD_PLAYER, techIds: TECH_FOR_CATALOG },
      [plainLand],
      tilesByKey
      // needVector omitted entirely
    );
    expect(result).toBeUndefined();
  });

  it("proposes HYDROWORKS on plain open land when FOOD_SLOTS is acutely deficient", () => {
    const plainLand = tile(5, 5, { ownerId: "ai-1", ownershipState: "SETTLED" });
    const tilesByKey = new Map<string, StructurePlannerTile>([["5,5", plainLand]]);
    const needVector: NeedVector = { ...ZERO_NEED_VECTOR, FOOD_SLOTS: 1 };

    const result = chooseBestEconomicBuild(
      { ...ECONOMIC_BUILD_PLAYER, techIds: TECH_FOR_CATALOG },
      [plainLand],
      tilesByKey,
      [plainLand],
      needVector
    );
    expect(result?.structureType).toBe("HYDROWORKS");
  });

  it("does not propose a catalog type on plain land when its need is fully satisfied (deficit 0)", () => {
    const plainLand = tile(5, 5, { ownerId: "ai-1", ownershipState: "SETTLED" });
    const tilesByKey = new Map<string, StructurePlannerTile>([["5,5", plainLand]]);

    const result = chooseBestEconomicBuild(
      { ...ECONOMIC_BUILD_PLAYER, techIds: TECH_FOR_CATALOG },
      [plainLand],
      tilesByKey,
      [plainLand],
      ZERO_NEED_VECTOR
    );
    expect(result).toBeUndefined();
  });

  it("proposes a town-support catalog type (ANCILLARY_FACTORY) scored by MANPOWER_THROUGHPUT deficit", () => {
    const town = tile(20, 20, {
      ownerId: "ai-1",
      ownershipState: "SETTLED",
      town: { populationTier: "TOWN", supportCurrent: 0, supportMax: 5 }
    });
    const openSupportTile = tile(21, 20, { ownerId: "ai-1", ownershipState: "SETTLED" });
    const tilesByKey = new Map<string, StructurePlannerTile>([
      ["20,20", town],
      ["21,20", openSupportTile]
    ]);
    // MANPOWER_THROUGHPUT fully acute, everything else zero (including
    // FOOD_SLOTS, so MANUFACTORY/INCUBATION_ENGINE score 0 via foodLow's unrelated
    // stockpile check but the catalog's ANCILLARY_FACTORY still wins on need).
    const needVector: NeedVector = { ...ZERO_NEED_VECTOR, MANPOWER_THROUGHPUT: 1 };

    const result = chooseBestEconomicBuild(
      { ...ECONOMIC_BUILD_PLAYER, techIds: [...TECH_FOR_CATALOG, "trade", "pottery"] },
      [town, openSupportTile],
      tilesByKey,
      [town, openSupportTile],
      needVector
    );
    expect(result?.structureType).toBe("ANCILLARY_FACTORY");
  });

  it("still proposes a synthesizer at a second town even after already owning one elsewhere (no empire-wide cap)", () => {
    // structure-slots.ts's old "hard-capped at 1 per family, forever" comment
    // is stale — runtime-structure-command-handlers.ts documents the cap as
    // removed (Decision 5: unlimited SYNTHESIZE-mode converters per family),
    // and each active copy genuinely adds its own slot supply
    // (resource-slot-view.ts's resourceSlotSupplyForPlayer sums per tile,
    // no dedup). Only a duplicate on the SAME town's support ring is
    // rejected (existingSupportStructureTypes, generic to every catalog
    // entry) — a second town with its own open support tile is legal.
    const town = tile(20, 20, {
      ownerId: "ai-1",
      ownershipState: "SETTLED",
      town: { populationTier: "TOWN", supportCurrent: 0, supportMax: 5 }
    });
    const openSupportTile = tile(21, 20, { ownerId: "ai-1", ownershipState: "SETTLED" });
    const tilesByKey = new Map<string, StructurePlannerTile>([
      ["20,20", town],
      ["21,20", openSupportTile]
    ]);
    const needVector: NeedVector = { ...ZERO_NEED_VECTOR, UMBRITE_SLOTS: 1 };
    const player = {
      ...ECONOMIC_BUILD_PLAYER,
      techIds: [...TECH_FOR_CATALOG, "trade", "pottery"],
      // Already owns one UMBRITE_WORKS, built elsewhere (not on this
      // town's support ring, per this fixture's tiles).
      ownedStructureCounts: { FORT: 0, SIEGE_BATTERY: 0, UMBRITE_WORKS: 1 }
    };

    const result = chooseBestEconomicBuild(player, [town, openSupportTile], tilesByKey, [town, openSupportTile], needVector);
    expect(result?.structureType).toBe("UMBRITE_WORKS");
  });

  it("gates catalog types on their required tech, same as the original 5 types", () => {
    const town = tile(20, 20, {
      ownerId: "ai-1",
      ownershipState: "SETTLED",
      town: { populationTier: "TOWN", supportCurrent: 0, supportMax: 5 }
    });
    const openSupportTile = tile(21, 20, { ownerId: "ai-1", ownershipState: "SETTLED" });
    const tilesByKey = new Map<string, StructurePlannerTile>([
      ["20,20", town],
      ["21,20", openSupportTile]
    ]);
    const needVector: NeedVector = { ...ZERO_NEED_VECTOR, MANPOWER_THROUGHPUT: 1 };

    // Without "remade-concordat" (ANCILLARY_FACTORY's tech requirement),
    // ANCILLARY_FACTORY's raw score (160, fully acute MANPOWER_THROUGHPUT)
    // would beat MANUFACTORY's flat 54 if the tech gate weren't applied — the
    // gate must exclude it regardless of how it scores.
    const result = chooseBestEconomicBuild(
      { ...ECONOMIC_BUILD_PLAYER, techIds: ["trade", "pottery"] },
      [town, openSupportTile],
      tilesByKey,
      [town, openSupportTile],
      needVector
    );
    expect(result?.structureType).toBe("MANUFACTORY");
  });
});
