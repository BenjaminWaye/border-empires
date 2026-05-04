import { describe, expect, it } from "vitest";

import { chooseAutomationGoapDecision } from "./automation-goap.js";

describe("automation goap", () => {
  it("chooses scout expansion goals for settled-territory paths when stable exploration is available", () => {
    const decision = chooseAutomationGoapDecision({
      hasNeutralLandOpportunity: false,
      hasScoutOpportunity: true,
      hasScaffoldOpportunity: false,
      hasBarbarianTarget: false,
      hasWeakEnemyBorder: false,
      hasSiegeOutpostSite: false,
      attackReady: false,
      needsSettlement: false,
      frontierDebtHigh: false,
      foodCoverageLow: false,
      underThreat: false,
      threatCritical: false,
      economyWeak: false,
      needsFortifiedAnchor: false,
      canAffordFrontierAction: true,
      canAffordSettlement: false,
      canBuildFort: false,
      canBuildEconomy: false,
      canBuildSiegeOutpost: false,
      goldHealthy: true,
      staminaHealthy: true
    }, "SETTLED_TERRITORY");

    expect(decision).toMatchObject({
      goalId: "expand_vision_for_value",
      actionKey: "claim_scout_border_tile"
    });
  });

  it("prefers fortification when the core is threatened and a fort is available", () => {
    const decision = chooseAutomationGoapDecision({
      hasNeutralLandOpportunity: true,
      hasScoutOpportunity: true,
      hasScaffoldOpportunity: false,
      hasBarbarianTarget: false,
      hasWeakEnemyBorder: true,
      hasSiegeOutpostSite: false,
      attackReady: true,
      needsSettlement: false,
      frontierDebtHigh: false,
      foodCoverageLow: false,
      underThreat: true,
      threatCritical: true,
      economyWeak: false,
      needsFortifiedAnchor: true,
      canAffordFrontierAction: true,
      canAffordSettlement: false,
      canBuildFort: true,
      canBuildEconomy: false,
      canBuildSiegeOutpost: false,
      goldHealthy: true,
      staminaHealthy: true
    }, "TOWN_CONTROL");

    expect(decision).toMatchObject({
      goalId: "fortify_core_chokepoint",
      actionKey: "build_fort_on_exposed_tile"
    });
  });

  it("prefers reserve recovery over speculative growth when gold and stamina are both unhealthy", () => {
    const decision = chooseAutomationGoapDecision({
      hasNeutralLandOpportunity: false,
      hasScoutOpportunity: true,
      hasScaffoldOpportunity: false,
      hasBarbarianTarget: false,
      hasWeakEnemyBorder: false,
      hasSiegeOutpostSite: false,
      attackReady: false,
      needsSettlement: false,
      frontierDebtHigh: false,
      foodCoverageLow: false,
      underThreat: false,
      threatCritical: false,
      economyWeak: false,
      needsFortifiedAnchor: false,
      canAffordFrontierAction: false,
      canAffordSettlement: false,
      canBuildFort: false,
      canBuildEconomy: false,
      canBuildSiegeOutpost: false,
      goldHealthy: false,
      staminaHealthy: false
    }, "SETTLED_TERRITORY");

    expect(decision).toMatchObject({
      goalId: "stabilize_reserves",
      actionKey: "wait_and_recover"
    });
  });

  it("still prefers cheap neutral expansion while settlement reserves are not yet healthy", () => {
    const decision = chooseAutomationGoapDecision({
      hasNeutralLandOpportunity: true,
      hasScoutOpportunity: false,
      hasScaffoldOpportunity: false,
      hasBarbarianTarget: false,
      hasWeakEnemyBorder: false,
      hasSiegeOutpostSite: false,
      attackReady: false,
      needsSettlement: false,
      frontierDebtHigh: false,
      foodCoverageLow: false,
      underThreat: false,
      threatCritical: false,
      economyWeak: true,
      needsFortifiedAnchor: false,
      canAffordFrontierAction: true,
      canAffordSettlement: false,
      canBuildFort: false,
      canBuildEconomy: true,
      canBuildSiegeOutpost: false,
      goldHealthy: false,
      staminaHealthy: true
    }, "ECONOMIC_HEGEMONY");

    expect(decision).toMatchObject({
      goalId: "secure_high_value_frontier",
      actionKey: "claim_neutral_border_tile"
    });
  });
});
