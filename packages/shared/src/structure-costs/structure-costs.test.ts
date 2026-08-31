import { describe, expect, test } from "vitest";

import { attackManpowerLossRangeForFort, FORT_TIER_LADDER, bestFortTierForTech, nextFortTierForUpgrade, requiredMusterForFort, SIEGE_TIER_LADDER, bestSiegeTierForTech, nextSiegeTierForUpgrade, structureBuildGoldCost, structureBuildManpowerCost, structureBuildManpowerCostScaled, structureCostDefinition } from "./structure-costs.js";

// Build gold costs are zeroed across the board (docs/manpower-economy-rewrite-plan.md
// §12: manpower is the sole build cost now; gold only gates a few structures
// on ongoing upkeep, never on the build itself) — scaling still multiplies
// zero by the same factor, so it stays at zero regardless of existing count.
describe("structureBuildGoldCost", () => {
  test("scaling structures (forts, siege outposts, observatory, airport) stay at zero gold regardless of existing count", () => {
    expect(structureBuildGoldCost("FORT", 0)).toBe(0);
    expect(structureBuildGoldCost("FORT", 1)).toBe(0);
    expect(structureBuildGoldCost("FORT", 2)).toBe(0);
    expect(structureBuildGoldCost("SIEGE_OUTPOST", 0)).toBe(0);
    expect(structureBuildGoldCost("SIEGE_OUTPOST", 3)).toBe(0);
    expect(structureBuildGoldCost("OBSERVATORY", 0)).toBe(0);
    expect(structureBuildGoldCost("OBSERVATORY", 1)).toBe(0);
    expect(structureBuildGoldCost("OBSERVATORY", 2)).toBe(0);
    expect(structureBuildGoldCost("AIRPORT", 0)).toBe(0);
    expect(structureBuildGoldCost("AIRPORT", 1)).toBe(0);
    expect(structureBuildGoldCost("AIRPORT", 2)).toBe(0);
  });

  test("keeps non-scaling structures at zero gold too", () => {
    expect(structureBuildGoldCost("MINTWORKS", 0)).toBe(0);
    expect(structureBuildGoldCost("MINTWORKS", 4)).toBe(0);
    expect(structureBuildGoldCost("CARAVANARY", 3)).toBe(0);
    expect(structureBuildGoldCost("FOUNDRY", 2)).toBe(0);
  });
});

// Design doc "escalating build cost": Titanium/Umbrite Weapons Factory are the one
// place `scaling` multiplies the real (manpower) cost instead of the
// (globally zeroed) gold cost every other structure's `scaling` describes.
describe("structureBuildManpowerCostScaled", () => {
  test("escalates Titanium Weapons Factory manpower cost with existing empire-wide count", () => {
    const base = structureBuildManpowerCost("TITANIUM_WEAPONS_FACTORY");
    expect(structureBuildManpowerCostScaled("TITANIUM_WEAPONS_FACTORY", 0)).toBe(base);
    expect(structureBuildManpowerCostScaled("TITANIUM_WEAPONS_FACTORY", 1)).toBe(Math.ceil(base * 1.15));
    expect(structureBuildManpowerCostScaled("TITANIUM_WEAPONS_FACTORY", 2)).toBe(Math.ceil(base * 1.15 ** 2));
    expect(structureBuildManpowerCostScaled("TITANIUM_WEAPONS_FACTORY", 5)).toBeGreaterThan(
      structureBuildManpowerCostScaled("TITANIUM_WEAPONS_FACTORY", 1)
    );
  });

  test("escalates Umbrite Weapons Factory manpower cost with existing empire-wide count", () => {
    const base = structureBuildManpowerCost("UMBRITE_WEAPONS_FACTORY");
    expect(structureBuildManpowerCostScaled("UMBRITE_WEAPONS_FACTORY", 0)).toBe(base);
    expect(structureBuildManpowerCostScaled("UMBRITE_WEAPONS_FACTORY", 1)).toBe(Math.ceil(base * 1.15));
    expect(structureBuildManpowerCostScaled("UMBRITE_WEAPONS_FACTORY", 3)).toBeGreaterThan(
      structureBuildManpowerCostScaled("UMBRITE_WEAPONS_FACTORY", 0)
    );
  });

  test("leaves every other structure's manpower cost flat regardless of existing count", () => {
    expect(structureBuildManpowerCostScaled("MINTWORKS", 0)).toBe(structureBuildManpowerCost("MINTWORKS"));
    expect(structureBuildManpowerCostScaled("MINTWORKS", 10)).toBe(structureBuildManpowerCost("MINTWORKS"));
    expect(structureBuildManpowerCostScaled("WEAPONS_WORKSHOP", 10)).toBe(structureBuildManpowerCost("WEAPONS_WORKSHOP"));
    // FORT has its own `scaling` entry (intended for gold, currently inert),
    // but manpower stays flat since FORT isn't in the manpower-scaling set.
    expect(structureBuildManpowerCostScaled("FORT", 5)).toBe(structureBuildManpowerCost("FORT"));
  });
});

describe("structureCostDefinition", () => {
  test("keeps income-support structures gold-only and preserves strategic-resource costs elsewhere", () => {
    expect(structureCostDefinition("MINTWORKS").resourceCost).toBeUndefined();
    expect(structureCostDefinition("CARAVANARY").resourceCost).toBeUndefined();
    // #1134 removed these as stale build-time crystal costs — the slot
    // system (structure-slots.ts) is the real FOOD/TITANIUM/CRYSTAL/UMBRITE gate
    // now, not a spent build cost (RETIRED_STOCKPILE_RESOURCE_KEYS strips
    // these before spend regardless of what's declared here).
    expect(structureCostDefinition("CUSTOMS_HOUSE").resourceCost).toBeUndefined();
    expect(structureCostDefinition("GARRISON_HALL").resourceCost).toBeUndefined();
  });
});

describe("FORT_TIER_LADDER", () => {
  test("WOODEN_FORT costs 0 gold, 0 titanium, 150 manpower, 1.35x defense", () => {
    const tier = FORT_TIER_LADDER.WOODEN_FORT;
    expect(tier.gold).toBe(0);
    expect(tier.titanium).toBe(0);
    expect(tier.manpower).toBe(150);
    expect(tier.defenseMult).toBe(1.35);
  });

  test("FORT is the base tier with 0 gold, 45 titanium, 300 manpower, 2.5x defense", () => {
    const tier = FORT_TIER_LADDER.FORT;
    expect(tier.gold).toBe(0);
    expect(tier.titanium).toBe(45);
    expect(tier.manpower).toBe(300);
    expect(tier.defenseMult).toBe(2.5);
  });

  test("TITANIUM_BASTION costs 0 gold, 90 titanium, 480 manpower, 4x defense", () => {
    const tier = FORT_TIER_LADDER.TITANIUM_BASTION;
    expect(tier.gold).toBe(0);
    expect(tier.titanium).toBe(90);
    expect(tier.manpower).toBe(480);
    expect(tier.defenseMult).toBe(4);
  });

  test("THUNDER_BASTION costs 0 gold, 180 titanium, 960 manpower, 8x defense", () => {
    const tier = FORT_TIER_LADDER.THUNDER_BASTION;
    expect(tier.gold).toBe(0);
    expect(tier.titanium).toBe(180);
    expect(tier.manpower).toBe(960);
    expect(tier.defenseMult).toBe(8);
  });

  test("bestFortTierForTech returns FORT when no fort tech is researched", () => {
    const hasTech = (id: string) => false;
    expect(bestFortTierForTech(hasTech).variant).toBe("FORT");
  });

  test("bestFortTierForTech returns TITANIUM_BASTION with fortified-walls but no steelworking", () => {
    const hasTech = (id: string) => id === "fortified-walls";
    expect(bestFortTierForTech(hasTech).variant).toBe("TITANIUM_BASTION");
  });

  test("bestFortTierForTech returns THUNDER_BASTION when steelworking is researched", () => {
    const hasTech = (id: string) => id === "steelworking" || id === "fortified-walls";
    expect(bestFortTierForTech(hasTech).variant).toBe("THUNDER_BASTION");
  });
});

describe("nextFortTierForUpgrade", () => {
  const hasBasicTech = (id: string) => id === "fortified-walls";
  const hasAllTech = (id: string) => id === "fortified-walls" || id === "steelworking";
  const hasNoTech = (id: string) => false;

  test("FORT → TITANIUM_BASTION when fortified-walls is researched", () => {
    expect(nextFortTierForUpgrade("FORT", hasBasicTech)?.variant).toBe("TITANIUM_BASTION");
  });

  test("FORT → null when no fort tech is researched", () => {
    expect(nextFortTierForUpgrade("FORT", hasNoTech)).toBeNull();
  });

  test("TITANIUM_BASTION → THUNDER_BASTION when steelworking is researched", () => {
    expect(nextFortTierForUpgrade("TITANIUM_BASTION", hasAllTech)?.variant).toBe("THUNDER_BASTION");
  });

  test("TITANIUM_BASTION → null when steelworking is not researched", () => {
    expect(nextFortTierForUpgrade("TITANIUM_BASTION", hasBasicTech)).toBeNull();
  });

  test("THUNDER_BASTION → null (already max tier)", () => {
    expect(nextFortTierForUpgrade("THUNDER_BASTION", hasAllTech)).toBeNull();
  });

  test("undefined variant treated as FORT → TITANIUM_BASTION with fortified-walls", () => {
    expect(nextFortTierForUpgrade(undefined, hasBasicTech)?.variant).toBe("TITANIUM_BASTION");
  });

  test("undefined variant treated as FORT → null with no tech", () => {
    expect(nextFortTierForUpgrade(undefined, hasNoTech)).toBeNull();
  });
});

describe("SIEGE_TIER_LADDER", () => {
  test("SIEGE_OUTPOST costs 0 gold, 45 umbrite, 0 titanium, 60 manpower, 1.6x attack", () => {
    const tier = SIEGE_TIER_LADDER.SIEGE_OUTPOST;
    expect(tier.gold).toBe(0);
    expect(tier.umbrite).toBe(45);
    expect(tier.titanium).toBe(0);
    expect(tier.manpower).toBe(60);
    expect(tier.attackMult).toBe(1.6);
  });

  test("SIEGE_TOWER costs 0 gold, 90 umbrite, 60 titanium, 60 manpower, 1.8x attack", () => {
    const tier = SIEGE_TIER_LADDER.SIEGE_TOWER;
    expect(tier.gold).toBe(0);
    expect(tier.umbrite).toBe(90);
    expect(tier.titanium).toBe(60);
    expect(tier.manpower).toBe(60);
    expect(tier.attackMult).toBe(1.8);
  });

  test("DREAD_TOWER costs 0 gold, 140 umbrite, 120 titanium, 60 manpower, 2.0x attack", () => {
    const tier = SIEGE_TIER_LADDER.DREAD_TOWER;
    expect(tier.gold).toBe(0);
    expect(tier.umbrite).toBe(140);
    expect(tier.titanium).toBe(120);
    expect(tier.manpower).toBe(60);
    expect(tier.attackMult).toBe(2.0);
  });

  test("bestSiegeTierForTech returns SIEGE_OUTPOST with no siege tech", () => {
    const hasTech = (id: string) => false;
    expect(bestSiegeTierForTech(hasTech).variant).toBe("SIEGE_OUTPOST");
  });

  test("bestSiegeTierForTech returns SIEGE_TOWER with siegecraft but no standing-army", () => {
    const hasTech = (id: string) => id === "siegecraft";
    expect(bestSiegeTierForTech(hasTech).variant).toBe("SIEGE_TOWER");
  });

  test("bestSiegeTierForTech returns DREAD_TOWER when standing-army is researched", () => {
    const hasTech = (id: string) => id === "standing-army" || id === "siegecraft";
    expect(bestSiegeTierForTech(hasTech).variant).toBe("DREAD_TOWER");
  });
});

describe("nextSiegeTierForUpgrade", () => {
  const hasBasicTech = (id: string) => id === "siegecraft";
  const hasAllTech = (id: string) => id === "siegecraft" || id === "standing-army";
  const hasNoTech = (id: string) => false;

  test("SIEGE_OUTPOST → SIEGE_TOWER when siegecraft is researched", () => {
    expect(nextSiegeTierForUpgrade("SIEGE_OUTPOST", hasBasicTech)?.variant).toBe("SIEGE_TOWER");
  });

  test("SIEGE_OUTPOST → null when no siege tech is researched", () => {
    expect(nextSiegeTierForUpgrade("SIEGE_OUTPOST", hasNoTech)).toBeNull();
  });

  test("SIEGE_TOWER → DREAD_TOWER when standing-army is researched", () => {
    expect(nextSiegeTierForUpgrade("SIEGE_TOWER", hasAllTech)?.variant).toBe("DREAD_TOWER");
  });

  test("SIEGE_TOWER → null when standing-army is not researched", () => {
    expect(nextSiegeTierForUpgrade("SIEGE_TOWER", hasBasicTech)).toBeNull();
  });

  test("DREAD_TOWER → null (already max tier)", () => {
    expect(nextSiegeTierForUpgrade("DREAD_TOWER", hasAllTech)).toBeNull();
  });

  test("undefined variant treated as SIEGE_OUTPOST → SIEGE_TOWER with siegecraft", () => {
    expect(nextSiegeTierForUpgrade(undefined, hasBasicTech)?.variant).toBe("SIEGE_TOWER");
  });

  test("undefined variant treated as SIEGE_OUTPOST → null with no tech", () => {
    expect(nextSiegeTierForUpgrade(undefined, hasNoTech)).toBeNull();
  });
});

describe("ATTACK_MANPOWER_LOSS_RANGE / requiredMusterForFort", () => {
  test("undefined (no active fort) ranges 40-60", () => {
    expect(attackManpowerLossRangeForFort(undefined)).toEqual({ min: 40, max: 60 });
    expect(requiredMusterForFort(undefined)).toBe(60);
  });

  test("WOODEN_FORT (Palisade) ranges 100-150", () => {
    expect(attackManpowerLossRangeForFort("WOODEN_FORT")).toEqual({ min: 100, max: 150 });
    expect(requiredMusterForFort("WOODEN_FORT")).toBe(150);
  });

  test("FORT ranges 200-300", () => {
    expect(attackManpowerLossRangeForFort("FORT")).toEqual({ min: 200, max: 300 });
    expect(requiredMusterForFort("FORT")).toBe(300);
  });

  test("TITANIUM_BASTION ranges 350-480", () => {
    expect(attackManpowerLossRangeForFort("TITANIUM_BASTION")).toEqual({ min: 350, max: 480 });
    expect(requiredMusterForFort("TITANIUM_BASTION")).toBe(480);
  });

  test("THUNDER_BASTION ranges 800-960", () => {
    expect(attackManpowerLossRangeForFort("THUNDER_BASTION")).toEqual({ min: 800, max: 960 });
    expect(requiredMusterForFort("THUNDER_BASTION")).toBe(960);
  });

  // required muster always equals the range's max: an attacker can never
  // lose more manpower than they mustered to launch the attack.
  test("required muster equals the max of every tier's loss range", () => {
    for (const variant of ["WOODEN_FORT", "FORT", "TITANIUM_BASTION", "THUNDER_BASTION"] as const) {
      expect(requiredMusterForFort(variant)).toBe(attackManpowerLossRangeForFort(variant).max);
    }
  });
});
