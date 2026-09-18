import { describe, expect, it } from "vitest";

import { chooseBestFortBuild, type StructurePlannerTile } from "./structure-command-planner.js";

const tile = (x: number, y: number, overrides: Partial<StructurePlannerTile> = {}): StructurePlannerTile => ({
  x,
  y,
  terrain: "LAND",
  ...overrides
});

describe("structure command planner — fort", () => {
  it("proposes a fort when affordable, regardless of existing owned count (runtime never scales FORT gold/resource cost by count)", () => {
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
      manpower: 1_000,
      techIds: ["masonry"],
      strategicResources: { TITANIUM: 45 }
    }, [candidate], tilesByKey, [candidate])).toBe(candidate);
    expect(chooseBestFortBuild({
      id: "ai-1",
      points: 1_000,
      manpower: 1_000,
      techIds: ["masonry"],
      strategicResources: { TITANIUM: 45 },
      ownedStructureCounts: { FORT: 2 }
    }, [candidate], tilesByKey, [candidate])).toBe(candidate);
  });

  // Regression: production staging (ai-5) had 74/74 BUILD_FORT commands
  // rejected with "insufficient TITANIUM for fort", forever, burning its
  // action budget every tick. Root cause had two layers:
  //  1) chooseBestFortBuild's affordability precheck hardcoded the base-tier
  //     FORT cost regardless of tech, while runtime-structure-command-handlers.ts
  //     always resolves the player's BEST available tier via
  //     bestFortTierForTech (fortified-walls -> TITANIUM_BASTION, steelworking
  //     -> THUNDER_BASTION) — a tier mismatch, fixed first.
  //  2) The precheck also gated on `resourceStock(player, "TITANIUM") <
  //     fortTier.titanium`, a stockpile check against a resource that no
  //     longer accumulates as a stockpile (TITANIUM/UMBRITE/CRYSTAL/FOOD
  //     build costs are resource-slot occupations per structure-slots.ts,
  //     not stockpile spends — FORT_TIER_LADDER's `titanium` field is
  //     vestigial/zeroed). That left the AI permanently unable to build any
  //     fort tier, since its TITANIUM stockpile was always 0. Fixed by
  //     dropping the stockpile check and replacing it with an optional
  //     freeTitaniumSlots gate (derived from the same slotSupplyByResource/
  //     slotDemandByResource totals runtime.ts already computes) — omitting
  //     any slot check here would reintroduce the exact same forever-rejected
  //     failure mode via slot exhaustion instead of stockpile.
  it("gates fort proposal on the tier the player will actually build, not the flat base-tier cost", () => {
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
    const basePlayer = {
      id: "ai-1",
      points: 1_000,
      manpower: 1_000,
      techIds: ["masonry", "fortified-walls"]
    };

    // Manpower enough for the flat base-tier FORT (300) but not the tier
    // fortified-walls actually unlocks, TITANIUM_BASTION (480) — must not
    // propose, or the AI would issue a command the runtime rejects.
    expect(chooseBestFortBuild(
      { ...basePlayer, manpower: 300, strategicResources: {} },
      [candidate],
      tilesByKey,
      [candidate]
    )).toBeUndefined();

    // Enough manpower for TITANIUM_BASTION's real cost (480), and *no*
    // TITANIUM stockpile at all — must still propose, since TITANIUM is
    // slot-gated at the runtime layer, not stockpile-gated here.
    expect(chooseBestFortBuild(
      { ...basePlayer, manpower: 480, strategicResources: {} },
      [candidate],
      tilesByKey,
      [candidate]
    )).toBe(candidate);
  });

  // Regression: chooseBestFortBuild dropping the TITANIUM stockpile check
  // (above) must not mean it ignores TITANIUM slot exhaustion entirely --
  // that would reintroduce the same "AI proposes a fort the runtime always
  // rejects" failure mode via slots instead of stockpile. TITANIUM_BASTION
  // needs 2 TITANIUM slots (structure-slots.ts); freeTitaniumSlots < 2 must
  // block the proposal, and >= 2 must allow it.
  it("gates fort proposal on free TITANIUM resource slots when supplied", () => {
    const candidate = tile(0, 0, {
      ownerId: "ai-1",
      ownershipState: "SETTLED",
      town: { populationTier: "TOWN" }
    });
    const tilesByKey = new Map([["0,0", candidate]]);
    const basePlayer = {
      id: "ai-1",
      points: 1_000,
      manpower: 1_000,
      techIds: ["masonry", "fortified-walls"]
    };

    // TITANIUM_BASTION needs 2 slots; only 1 free -- must not propose.
    expect(chooseBestFortBuild(basePlayer, [candidate], tilesByKey, [candidate], 1)).toBeUndefined();

    // Exactly 2 free -- affordable, must propose.
    expect(chooseBestFortBuild(basePlayer, [candidate], tilesByKey, [candidate], 2)).toBe(candidate);

    // freeTitaniumSlots omitted entirely -- caller didn't supply slot totals,
    // so the slot check is skipped (same as before this gate existed).
    expect(chooseBestFortBuild(basePlayer, [candidate], tilesByKey, [candidate])).toBe(candidate);
  });
});
