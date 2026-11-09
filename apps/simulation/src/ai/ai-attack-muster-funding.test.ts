import { describe, expect, it } from "vitest";
import { FRONTIER_ATTACK_MUSTER_COST, MUSTER_ATTACK_COST } from "@border-empires/shared";
import { createAutomationNoopDiagnostic, type AutomationPlannerTile } from "./automation-command-planner-types.js";
import type { AutomationPlannerDecisionContext } from "./automation-command-planner-helpers.js";
import type { AutomationStrategicSnapshot } from "./automation-strategic-snapshot.js";
import { attackHasFundedMuster, minimumMusterForAttackTarget } from "./ai-attack-muster-funding.js";
import { runUtilityPolicy, type UtilityDispatchState } from "./utility/utility-dispatch.js";

const tile = (x: number, y: number, ownerId: string, extra: Partial<AutomationPlannerTile> = {}): AutomationPlannerTile => ({
  x,
  y,
  terrain: "LAND",
  ownerId,
  ownershipState: "FRONTIER",
  ...extra
});

const lookup = (...tiles: AutomationPlannerTile[]): Map<string, AutomationPlannerTile> =>
  new Map(tiles.map((t) => [`${t.x},${t.y}`, t]));

describe("attackHasFundedMuster", () => {
  const origin = tile(100, 100, "ai-1");
  const frontierTarget = tile(101, 100, "ai-2");

  it("uses the frontier floor for FRONTIER targets and the settled cost for SETTLED targets", () => {
    expect(minimumMusterForAttackTarget({ ownershipState: "FRONTIER" })).toBe(FRONTIER_ATTACK_MUSTER_COST);
    expect(minimumMusterForAttackTarget({ ownershipState: "SETTLED" })).toBe(MUSTER_ATTACK_COST);
  });

  it("is false with no flags at all (staging season-41: INSUFFICIENT_MUSTER loop)", () => {
    expect(attackHasFundedMuster({ playerId: "ai-1", from: origin, target: frontierTarget, musterTileKeys: new Set(), tilesByKey: lookup(origin) })).toBe(false);
  });

  it("is true when a funded own flag sits within 10 tiles, false beyond", () => {
    const near = tile(108, 104, "ai-1", { muster: { ownerId: "ai-1", amount: 20 } });
    const far = tile(111, 100, "ai-1", { muster: { ownerId: "ai-1", amount: 500 } });
    expect(attackHasFundedMuster({ playerId: "ai-1", from: origin, target: frontierTarget, musterTileKeys: new Set(["108,104"]), tilesByKey: lookup(origin, near) })).toBe(true);
    expect(attackHasFundedMuster({ playerId: "ai-1", from: origin, target: frontierTarget, musterTileKeys: new Set(["111,100"]), tilesByKey: lookup(origin, far) })).toBe(false);
  });

  it("is false when the nearby flag holds less than the target needs", () => {
    const thin = tile(102, 102, "ai-1", { muster: { ownerId: "ai-1", amount: 30 } });
    const settledTarget = tile(101, 100, "ai-2", { ownershipState: "SETTLED" });
    expect(attackHasFundedMuster({ playerId: "ai-1", from: origin, target: settledTarget, musterTileKeys: new Set(["102,102"]), tilesByKey: lookup(origin, thin) })).toBe(false);
  });

  it("counts a funded flag on the origin itself", () => {
    const flaggedOrigin = tile(100, 100, "ai-1", { muster: { ownerId: "ai-1", amount: 15 } });
    expect(attackHasFundedMuster({ playerId: "ai-1", from: flaggedOrigin, target: frontierTarget, musterTileKeys: new Set(), tilesByKey: lookup(flaggedOrigin) })).toBe(true);
  });

  it("does not block when flag data is unknown (no flag list, or an in-range flag outside the view)", () => {
    expect(attackHasFundedMuster({ playerId: "ai-1", from: origin, target: frontierTarget, musterTileKeys: undefined, tilesByKey: lookup(origin) })).toBe(true);
    expect(attackHasFundedMuster({ playerId: "ai-1", from: origin, target: frontierTarget, musterTileKeys: new Set(["104,104"]), tilesByKey: lookup(origin) })).toBe(true);
  });
});

const strategic: AutomationStrategicSnapshot = {
  primaryVictoryPath: "TOWN_CONTROL",
  strategicFocus: "BALANCED",
  frontPosture: "WAR",
  underThreat: true,
  threatCritical: false,
  growthFoundationEstablished: true,
  townSupportExpandAvailable: false,
  islandExpandAvailable: false,
  openingScoutAvailable: false,
  scoutExpandWorthwhile: false,
  pressureAttackScore: 1100,
  pressureThreatensCore: false,
  attackReady: true,
  musterReady: false,
  manpowerSufficient: true,
  hasActiveTown: true,
  hasActiveDock: false
};

const barbarianFrontState = (attackMusterFunded: UtilityDispatchState<AutomationPlannerTile>["attackMusterFunded"]): UtilityDispatchState<AutomationPlannerTile> => {
  const context: AutomationPlannerDecisionContext<AutomationPlannerTile> = {
    playerId: "ai-1",
    clientSeq: 1,
    issuedAt: 1_000,
    sessionPrefix: "ai-runtime",
    diagnostic: createAutomationNoopDiagnostic("ai-1", "ai-runtime", "wait_and_recover"),
    frontierAnalysis: {
      frontierEnemyTargetCount: 1,
      frontierEnemyPlayerTargetCount: 0,
      frontierBarbarianTargetCount: 1,
      frontierNeutralTargetCount: 0,
      frontierOpportunityEconomic: 0,
      frontierOpportunityTownSupport: 0,
      frontierOpportunityScout: 0,
      frontierOpportunityScaffold: 0,
      frontierOpportunityWaste: 0,
      narrowAnalyzeCapped: false,
      neighborCandidateTotal: 1,
      missingNeighborTileCount: 0,
      barbarianAttack: { from: tile(10, 10, "ai-1"), target: tile(11, 10, "barbarian-1"), score: 100 }
    },
    needsFood: false,
    needsEconomy: false
  };
  return {
    context,
    strategic,
    canAttack: true,
    canExpand: false,
    devSlotAvailable: true,
    preferredEnemyAttack: undefined,
    economicBuild: undefined,
    fortBuild: undefined,
    siegeBatteryBuild: undefined,
    relayBeaconBuild: undefined,
    foodSlotReliefTarget: undefined,
    foodSlotsExhausted: false,
    foodSlotReenableTarget: undefined,
    attackStalemateTargetTileKeys: undefined,
    attackMusterFunded,
    expansionObjective: undefined,
    points: 1_000,
    manpower: 1_000,
    decisionCooldowns: undefined,
    beaconBoostActive: false
  };
};

describe("ATTACK dispatch respects muster funding", () => {
  it("emits the ATTACK when a muster flag can fund it", () => {
    const result = runUtilityPolicy(barbarianFrontState(() => true));
    expect(result.command?.type).toBe("ATTACK");
    expect(result.diagnostic.utilityGates?.attackUnfunded).toBe(false);
  });

  it("does not emit an unfundable ATTACK and does not count it as a candidate", () => {
    const result = runUtilityPolicy(barbarianFrontState(() => false));
    expect(result.command?.type).not.toBe("ATTACK");
    expect(result.diagnostic.utilityGates?.hasAnyAttackCandidate).toBe(false);
    expect(result.diagnostic.utilityScores?.ATTACK).toBe(0);
    expect(result.diagnostic.utilityGates?.attackUnfunded).toBe(true);
  });
});
