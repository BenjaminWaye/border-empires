import { describe, expect, test } from "vitest";

import { FORT_TIER_LADDER, bestFortTierForTech, nextFortTierForUpgrade, SIEGE_TIER_LADDER, bestSiegeTierForTech, nextSiegeTierForUpgrade, structureBuildGoldCost, structureCostDefinition } from "../src/structure-costs.js";

describe("structureBuildGoldCost", () => {
  test("scales forts and siege outposts by 10 percent per additional structure", () => {
    expect(structureBuildGoldCost("FORT", 0)).toBe(900);
    expect(structureBuildGoldCost("FORT", 1)).toBe(991);
    expect(structureBuildGoldCost("FORT", 2)).toBe(1090);
    expect(structureBuildGoldCost("SIEGE_OUTPOST", 0)).toBe(900);
    expect(structureBuildGoldCost("SIEGE_OUTPOST", 3)).toBe(1198);
  });

  test("doubles observatory and airport costs per additional structure", () => {
    expect(structureBuildGoldCost("OBSERVATORY", 0)).toBe(800);
    expect(structureBuildGoldCost("OBSERVATORY", 1)).toBe(1600);
    expect(structureBuildGoldCost("OBSERVATORY", 2)).toBe(3200);
    expect(structureBuildGoldCost("AIRPORT", 0)).toBe(3000);
    expect(structureBuildGoldCost("AIRPORT", 1)).toBe(6000);
    expect(structureBuildGoldCost("AIRPORT", 2)).toBe(12000);
  });

  test("keeps non-scaling structures at their base gold cost", () => {
    expect(structureBuildGoldCost("MARKET", 0)).toBe(2200);
    expect(structureBuildGoldCost("MARKET", 4)).toBe(2200);
    expect(structureBuildGoldCost("BANK", 1)).toBe(3200);
    expect(structureBuildGoldCost("CARAVANARY", 3)).toBe(2600);
    expect(structureBuildGoldCost("FOUNDRY", 2)).toBe(4500);
  });
});

describe("structureCostDefinition", () => {
  test("keeps income-support structures gold-only and preserves strategic-resource costs elsewhere", () => {
    expect(structureCostDefinition("MARKET").resourceCost).toBeUndefined();
    expect(structureCostDefinition("BANK").resourceCost).toBeUndefined();
    expect(structureCostDefinition("CARAVANARY").resourceCost).toBeUndefined();
    expect(structureCostDefinition("CUSTOMS_HOUSE").resourceCost).toEqual({ resource: "CRYSTAL", amount: 60 });
    expect(structureCostDefinition("GARRISON_HALL").resourceCost).toEqual({ resource: "CRYSTAL", amount: 80 });
  });
});

describe("FORT_TIER_LADDER", () => {
  test("FORT is the base tier with 900 gold, 45 iron, 300 manpower, 2.5x defense", () => {
    const tier = FORT_TIER_LADDER.FORT;
    expect(tier.gold).toBe(900);
    expect(tier.iron).toBe(45);
    expect(tier.manpower).toBe(300);
    expect(tier.defenseMult).toBe(2.5);
  });

  test("IRON_BASTION costs 1800 gold, 90 iron, 300 manpower, 4x defense", () => {
    const tier = FORT_TIER_LADDER.IRON_BASTION;
    expect(tier.gold).toBe(1800);
    expect(tier.iron).toBe(90);
    expect(tier.manpower).toBe(300);
    expect(tier.defenseMult).toBe(4);
  });

  test("THUNDER_BASTION costs 4200 gold, 180 iron, 300 manpower, 8x defense", () => {
    const tier = FORT_TIER_LADDER.THUNDER_BASTION;
    expect(tier.gold).toBe(4200);
    expect(tier.iron).toBe(180);
    expect(tier.manpower).toBe(300);
    expect(tier.defenseMult).toBe(8);
  });

  test("bestFortTierForTech returns FORT when no fort tech is researched", () => {
    const hasTech = (id: string) => false;
    expect(bestFortTierForTech(hasTech).variant).toBe("FORT");
  });

  test("bestFortTierForTech returns IRON_BASTION with fortified-walls but no steelworking", () => {
    const hasTech = (id: string) => id === "fortified-walls";
    expect(bestFortTierForTech(hasTech).variant).toBe("IRON_BASTION");
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

  test("FORT → IRON_BASTION when fortified-walls is researched", () => {
    expect(nextFortTierForUpgrade("FORT", hasBasicTech)?.variant).toBe("IRON_BASTION");
  });

  test("FORT → null when no fort tech is researched", () => {
    expect(nextFortTierForUpgrade("FORT", hasNoTech)).toBeNull();
  });

  test("IRON_BASTION → THUNDER_BASTION when steelworking is researched", () => {
    expect(nextFortTierForUpgrade("IRON_BASTION", hasAllTech)?.variant).toBe("THUNDER_BASTION");
  });

  test("IRON_BASTION → null when steelworking is not researched", () => {
    expect(nextFortTierForUpgrade("IRON_BASTION", hasBasicTech)).toBeNull();
  });

  test("THUNDER_BASTION → null (already max tier)", () => {
    expect(nextFortTierForUpgrade("THUNDER_BASTION", hasAllTech)).toBeNull();
  });

  test("undefined variant treated as FORT → IRON_BASTION with fortified-walls", () => {
    expect(nextFortTierForUpgrade(undefined, hasBasicTech)?.variant).toBe("IRON_BASTION");
  });

  test("undefined variant treated as FORT → null with no tech", () => {
    expect(nextFortTierForUpgrade(undefined, hasNoTech)).toBeNull();
  });
});

describe("SIEGE_TIER_LADDER", () => {
  test("SIEGE_OUTPOST costs 900 gold, 45 supply, 0 iron, 60 manpower, 1.6x attack", () => {
    const tier = SIEGE_TIER_LADDER.SIEGE_OUTPOST;
    expect(tier.gold).toBe(900);
    expect(tier.supply).toBe(45);
    expect(tier.iron).toBe(0);
    expect(tier.manpower).toBe(60);
    expect(tier.attackMult).toBe(1.6);
  });

  test("SIEGE_TOWER costs 1800 gold, 90 supply, 60 iron, 60 manpower, 1.8x attack", () => {
    const tier = SIEGE_TIER_LADDER.SIEGE_TOWER;
    expect(tier.gold).toBe(1800);
    expect(tier.supply).toBe(90);
    expect(tier.iron).toBe(60);
    expect(tier.manpower).toBe(60);
    expect(tier.attackMult).toBe(1.8);
  });

  test("DREAD_TOWER costs 4200 gold, 140 supply, 120 iron, 60 manpower, 2.0x attack", () => {
    const tier = SIEGE_TIER_LADDER.DREAD_TOWER;
    expect(tier.gold).toBe(4200);
    expect(tier.supply).toBe(140);
    expect(tier.iron).toBe(120);
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
