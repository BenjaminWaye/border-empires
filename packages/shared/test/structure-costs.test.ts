import { describe, expect, test } from "vitest";

import { FORT_TIER_LADDER, bestFortTierForTech, nextFortTierForUpgrade, structureBuildGoldCost, structureCostDefinition } from "../src/structure-costs.js";

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
