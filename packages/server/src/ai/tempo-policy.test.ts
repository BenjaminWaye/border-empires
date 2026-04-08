import { describe, expect, it } from "vitest";
import {
  hasAiGrowthFoundation,
  isAiAttackReady,
  shouldAiStayInIslandFootprint,
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

  it("keeps high-momentum settled-territory empires in island-footprint mode even while recovering", () => {
    expect(
      shouldAiStayInIslandFootprint({
        primaryVictoryPath: "SETTLED_TERRITORY",
        growthFoundationEstablished: true,
        undercoveredIslandCount: 12,
        islandExpandAvailable: true,
        islandSettlementAvailable: false,
        foodCoverageLow: false,
        foodCoverage: 1,
        pressureThreatensCore: false,
        frontierOpportunityEconomic: 1,
        frontierOpportunityScaffold: 0,
        frontierOpportunityWaste: 40,
        economyWeak: true,
        controlledTowns: 2,
        settledTiles: 80,
        aiIncome: 6
      })
    ).toBe(true);

    expect(
      shouldAiStayInIslandFootprint({
        primaryVictoryPath: "SETTLED_TERRITORY",
        growthFoundationEstablished: true,
        undercoveredIslandCount: 12,
        islandExpandAvailable: true,
        islandSettlementAvailable: false,
        foodCoverageLow: false,
        foodCoverage: 1,
        pressureThreatensCore: false,
        frontierOpportunityEconomic: 0,
        frontierOpportunityScaffold: 0,
        frontierOpportunityWaste: 220,
        economyWeak: true,
        controlledTowns: 1,
        settledTiles: 18,
        aiIncome: 2
      })
    ).toBe(false);
  });
});
