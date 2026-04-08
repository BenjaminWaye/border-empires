import { describe, expect, it } from "vitest";
import {
  hasAiGrowthFoundation,
  isAiAttackReady,
  isAiScoutExpansionWorthwhile,
  requiredAiAttackManpower
} from "./tempo-policy.js";

describe("tempo policy", () => {
  it("treats towns, docks, and stable income as a growth foundation", () => {
    expect(hasAiGrowthFoundation({ controlledTowns: 0, hasActiveTown: false, hasActiveDock: false, aiIncome: 11 })).toBe(false);
    expect(hasAiGrowthFoundation({ controlledTowns: 1, hasActiveTown: false, hasActiveDock: false, aiIncome: 4 })).toBe(true);
    expect(hasAiGrowthFoundation({ controlledTowns: 0, hasActiveTown: true, hasActiveDock: false, aiIncome: 4 })).toBe(true);
    expect(hasAiGrowthFoundation({ controlledTowns: 0, hasActiveTown: false, hasActiveDock: false, aiIncome: 12 })).toBe(true);
  });

  it("rejects scout expansion when the empire should convert land into power instead", () => {
    expect(
      isAiScoutExpansionWorthwhile({
        settledTiles: 5,
        underThreat: false,
        economyWeak: true,
        settlementAvailable: false,
        frontierOpportunityEconomic: 0,
        frontierOpportunityScout: 31,
        frontierOpportunityWaste: 34,
        hasGrowthFoundation: true
      })
    ).toBe(false);

    expect(
      isAiScoutExpansionWorthwhile({
        settledTiles: 6,
        underThreat: false,
        economyWeak: false,
        settlementAvailable: false,
        frontierOpportunityEconomic: 1,
        frontierOpportunityScout: 6,
        frontierOpportunityWaste: 2,
        hasGrowthFoundation: true
      })
    ).toBe(true);
  });

  it("requires a larger manpower buffer before voluntary attacks", () => {
    expect(
      requiredAiAttackManpower({
        attackManpowerMin: 60,
        underThreat: false,
        threatCritical: false,
        economyWeak: true,
        controlledTowns: 1
      })
    ).toBe(75);

    expect(
      isAiAttackReady({
        manpower: 60,
        attackManpowerMin: 60,
        underThreat: false,
        threatCritical: false,
        economyWeak: true,
        controlledTowns: 1
      })
    ).toBe(false);

    expect(
      isAiAttackReady({
        manpower: 60,
        attackManpowerMin: 60,
        underThreat: true,
        threatCritical: true,
        economyWeak: true,
        controlledTowns: 1
      })
    ).toBe(true);
  });
});
