import { describe, expect, test } from "vitest";

import { structureBuildGoldCost, structureCostDefinition } from "../src/structure-costs.js";

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
