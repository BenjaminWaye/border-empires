import { describe, expect, it } from "vitest";
import { createAutomationNoopDiagnostic } from "../automation-command-planner-types.js";
import type { AutomationPlannerDecisionContext } from "../automation-command-planner-helpers.js";
import type { AutomationPlannerTile } from "../automation-command-planner-types.js";
import type { AutomationStrategicSnapshot } from "../automation-strategic-snapshot.js";
import { runUtilityPolicy, type UtilityDispatchState } from "./utility-dispatch.js";

/**
 * FREE_FOOD_SLOT dispatch: for a "disable" target, always disables
 * (SET_CONVERTER_STRUCTURE_ENABLED, reversible) — never demolishes; for the
 * tier-3 "abandon_town" target, issues UNCAPTURE_TILE instead. See
 * food-slot-relief.ts and decisions-free-food-slot.test.ts (scorer gating).
 */
const baseStrategic = (): AutomationStrategicSnapshot => ({
  primaryVictoryPath: "TOWN_CONTROL",
  strategicFocus: "BALANCED",
  frontPosture: "HOLD",
  underThreat: false,
  threatCritical: false,
  growthFoundationEstablished: true,
  townSupportExpandAvailable: false,
  islandExpandAvailable: false,
  openingScoutAvailable: false,
  scoutExpandWorthwhile: false,
  pressureAttackScore: 0,
  pressureThreatensCore: false,
  attackReady: false,
  musterReady: false,
  manpowerSufficient: true,
  hasActiveTown: true,
  hasActiveDock: false
});

const buildState = (
  overrides: Partial<UtilityDispatchState<AutomationPlannerTile>>
): UtilityDispatchState<AutomationPlannerTile> => {
  const context: AutomationPlannerDecisionContext<AutomationPlannerTile> = {
    playerId: "ai-1",
    clientSeq: 1,
    issuedAt: 1_000,
    sessionPrefix: "ai-runtime",
    diagnostic: createAutomationNoopDiagnostic("ai-1", "ai-runtime", "wait_and_recover"),
    frontierAnalysis: {
      frontierEnemyTargetCount: 0,
      frontierEnemyPlayerTargetCount: 0,
      frontierBarbarianTargetCount: 0,
      frontierNeutralTargetCount: 0,
      frontierOpportunityEconomic: 0,
      frontierOpportunityTownSupport: 0,
      frontierOpportunityScout: 0,
      frontierOpportunityScaffold: 0,
      frontierOpportunityWaste: 0,
      narrowAnalyzeCapped: false,
      neighborCandidateTotal: 0,
      missingNeighborTileCount: 0
    },
    tilesByKey: new Map(),
    needsFood: true,
    needsEconomy: false
  };

  return {
    context,
    strategic: baseStrategic(),
    canAttack: false,
    canExpand: false,
    devSlotAvailable: true,
    preferredEnemyAttack: undefined,
    economicBuild: undefined,
    fortBuild: undefined,
    siegeOutpostBuild: undefined,
    relayBeaconBuild: undefined,
    foodSlotReliefTarget: undefined,
    foodSlotsExhausted: true,
    attackStalemateTargetTileKeys: undefined,
    expansionObjective: undefined,
    points: 1_000,
    manpower: 1_000,
    decisionCooldowns: undefined,
    beaconBoostActive: false,
    ...overrides
  };
};

describe("runUtilityPolicy FREE_FOOD_SLOT dispatch", () => {
  it("disables the food-slot-relief target (SET_CONVERTER_STRUCTURE_ENABLED, reversible) — never REMOVE_STRUCTURE", () => {
    const result = runUtilityPolicy(buildState({ foodSlotReliefTarget: { x: 7, y: 8, kind: "disable" } }));
    expect(result.command).toMatchObject({
      type: "SET_CONVERTER_STRUCTURE_ENABLED",
      payloadJson: JSON.stringify({ x: 7, y: 8, enabled: false })
    });
  });

  it("issues UNCAPTURE_TILE for the tier-3 abandon_town target instead of disabling", () => {
    const result = runUtilityPolicy(buildState({ foodSlotReliefTarget: { x: 3, y: 4, kind: "abandon_town" } }));
    expect(result.command).toMatchObject({
      type: "UNCAPTURE_TILE",
      payloadJson: JSON.stringify({ x: 3, y: 4 })
    });
  });

  it("produces no command when there's no relief target", () => {
    const result = runUtilityPolicy(buildState({ foodSlotReliefTarget: undefined, foodSlotsExhausted: false }));
    expect(result.diagnostic.utilityWinner).not.toBe("FREE_FOOD_SLOT");
  });
});
