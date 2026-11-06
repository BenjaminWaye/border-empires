import { describe, expect, it } from "vitest";
import { TITANIUM_WEAPONS_FACTORY_ATTACK_MULT_PER_BUILDING, type BuildableStructureType } from "@border-empires/shared";
import {
  salvageArmsMultForPlayer,
  titaniumWeaponsFactoryAttackMultForPlayer,
  titaniumWeaponsFactoryDefenseMultForPlayer,
  umbriteWeaponsFactoryAttackMultForPlayer,
  umbriteWeaponsFactoryDefenseMultForPlayer,
  weaponsBreakdownCountsForPlayer,
  weaponsWorkshopAttackMultForPlayer,
  weaponsWorkshopDefenseMultForPlayer,
  type WeaponsFactoryMultContext
} from "../runtime-weapons-factory-mults.js";
import { appendWeaponsFactoryBreakdownEntries } from "./weapons-factory-mod-breakdown.js";

const product = (rows: Array<{ mult: number }>): number => rows.reduce((acc, row) => acc * row.mult, 1);

describe("weapons rows in modBreakdown", () => {
  // Regression: the profile's Attack/Defense left out Weapons Workshops and
  // precursor salvage, which combat folds into base strength.
  it("multiply to the same infrastructure combat applies", () => {
    const owned: Partial<Record<BuildableStructureType, number>> = {
      TITANIUM_WEAPONS_FACTORY: 2,
      UMBRITE_WEAPONS_FACTORY: 3,
      WEAPONS_WORKSHOP: 1,
      RECLAMATION_WORKS: 4
    };
    const ctx: WeaponsFactoryMultContext = { ownedStructureCountForPlayer: (_id, type) => owned[type] ?? 0 };
    const breakdown = { attack: [], defense: [], income: [], vision: [] } as Parameters<typeof appendWeaponsFactoryBreakdownEntries>[0];
    appendWeaponsFactoryBreakdownEntries(breakdown, weaponsBreakdownCountsForPlayer(ctx, "p1"));
    const combatAttack = weaponsWorkshopAttackMultForPlayer(ctx, "p1") * titaniumWeaponsFactoryAttackMultForPlayer(ctx, "p1")
      * umbriteWeaponsFactoryAttackMultForPlayer(ctx, "p1") * salvageArmsMultForPlayer(ctx, "p1");
    const combatDefense = weaponsWorkshopDefenseMultForPlayer(ctx, "p1") * titaniumWeaponsFactoryDefenseMultForPlayer(ctx, "p1")
      * umbriteWeaponsFactoryDefenseMultForPlayer(ctx, "p1") * salvageArmsMultForPlayer(ctx, "p1");
    expect(product(breakdown.attack)).toBeCloseTo(combatAttack, 10);
    expect(product(breakdown.defense)).toBeCloseTo(combatDefense, 10);
    expect(breakdown.attack.map((row) => row.label)).toEqual(["Weapons Workshop ×1", "Titanium Weapons Factory ×2", "Umbrite Weapons Factory ×3", "Precursor salvage"]);
  });

  // Regression: rows used the raw factory count, but combat multiplies by the
  // concentrated equivalent (towns supported by several factories count more).
  it("uses the concentrated factory equivalent, keeping the raw count as the label", () => {
    const breakdown = { attack: [], defense: [], income: [], vision: [] } as Parameters<typeof appendWeaponsFactoryBreakdownEntries>[0];
    appendWeaponsFactoryBreakdownEntries(breakdown, { titanium: 3, umbrite: 0, titaniumEquivalent: 3.9 });
    expect(breakdown.attack).toEqual([{ label: "Titanium Weapons Factory ×3", mult: 1 + 3.9 * TITANIUM_WEAPONS_FACTORY_ATTACK_MULT_PER_BUILDING }]);
  });
});
