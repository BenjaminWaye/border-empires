/**
 * "Stop the leader": AIs gang up on a rival near or holding a season win.
 * Covers the focus weights (ai-victory-focus.ts), their export onto every
 * AI's planner view (ai-victory-standings.ts), the enemy-target bias
 * (frontier-command-planner.ts) and the ATTACK/MUSTER boost (decisions.ts).
 */
import { describe, expect, it } from "vitest";
import type { SeasonVictoryObjectiveSnapshot } from "@border-empires/sim-protocol";

import { VICTORY_FOCUS_NEAR_WIN_MAX_WEIGHT, victoryFocusTargetsFor, victoryFocusWeights } from "./ai-victory-focus.js";
import { createVictoryStandingsLookup, withVictoryStandings } from "./ai-victory-standings.js";
import { buildAutomationStrategicSnapshot } from "./automation-strategic-snapshot.js";
import { analyzeOwnedFrontierTargetsFromLookup } from "./frontier-command-planner.js";
import { threatScoreOf } from "./frontier-scoring.js";
import type { PlannerPlayerView } from "./planner-world-view.js";
import { type DecisionInputs, scoreDecision } from "./utility/decisions.js";
import { vetoReasonsFor } from "./utility/wait-reasons.js";

const objective = (overrides: Partial<SeasonVictoryObjectiveSnapshot> & Pick<SeasonVictoryObjectiveSnapshot, "id">): SeasonVictoryObjectiveSnapshot => ({
  name: overrides.id,
  description: "",
  leaderName: "",
  progressLabel: "",
  thresholdLabel: "",
  holdDurationSeconds: 86_400,
  statusLabel: "",
  conditionMet: false,
  ...overrides
});

describe("victoryFocusWeights", () => {
  it("pulls hardest toward a player holding a condition, partially toward a near-win, not at all otherwise", () => {
    const weights = victoryFocusWeights([
      objective({ id: "TOWN_CONTROL", leaderPlayerId: "human-1", conditionMet: true, progress: 1 }),
      objective({ id: "ECONOMIC_HEGEMONY", leaderPlayerId: "ai-2", progress: 0.95 }),
      objective({ id: "MARITIME_SUPREMACY", leaderPlayerId: "ai-3", progress: 0.5 }),
      objective({ id: "RESOURCE_MONOPOLY" })
    ]);
    expect(weights.get("human-1")).toBe(1);
    expect(weights.get("ai-2")).toBeGreaterThan(0);
    expect(weights.get("ai-2")).toBeLessThan(VICTORY_FOCUS_NEAR_WIN_MAX_WEIGHT);
    expect(weights.has("ai-3")).toBe(false);
  });

  it("keeps a player's strongest objective and never targets itself", () => {
    const weights = victoryFocusWeights([
      objective({ id: "TOWN_CONTROL", leaderPlayerId: "ai-1", progress: 0.8 }),
      objective({ id: "MARITIME_SUPREMACY", leaderPlayerId: "ai-1", conditionMet: true, progress: 1 })
    ]);
    expect(weights.get("ai-1")).toBe(1);
    expect(victoryFocusTargetsFor(weights, "ai-1")).toBeUndefined();
    expect(victoryFocusTargetsFor(weights, "ai-2")).toEqual({ "ai-1": 1 });
  });
});

describe("withVictoryStandings focus export", () => {
  it("gives every other AI the leader as a focus target, including a human leader", () => {
    const lookup = createVictoryStandingsLookup(() => ({
      objectives: [objective({ id: "TOWN_CONTROL", leaderPlayerId: "human-1", conditionMet: true, progress: 1 })],
      selfProgress: new Map([["ai-1", new Map([["TOWN_CONTROL" as const, 0.2]])]])
    }));
    const views = withVictoryStandings([{ id: "ai-1" } as PlannerPlayerView, { id: "ai-2" } as PlannerPlayerView], lookup);
    expect(views.map((view) => view.victoryFocusTargets)).toEqual([{ "human-1": 1 }, { "human-1": 1 }]);
  });
});

describe("frontier enemy target bias", () => {
  it("attacks the victory leader's border tile over an otherwise better neighbour's", () => {
    const tiles = new Map([
      ["10,10", { x: 10, y: 10, terrain: "LAND" as const, ownerId: "ai-1", ownershipState: "SETTLED" }],
      ["10,11", { x: 10, y: 11, terrain: "LAND" as const, ownerId: "ai-1", ownershipState: "SETTLED" }],
      // enemy-1's tile touches two of ai-1's tiles, so it normally wins.
      ["11,11", { x: 11, y: 11, terrain: "LAND" as const, ownerId: "enemy-1", ownershipState: "SETTLED" }],
      ["9,9", { x: 9, y: 9, terrain: "LAND" as const, ownerId: "leader-1", ownershipState: "SETTLED" }]
    ]);
    const owned = [tiles.get("10,10")!, tiles.get("10,11")!];
    const plain = analyzeOwnedFrontierTargetsFromLookup(tiles, owned, "ai-1", { nowMs: 0 });
    expect(plain.enemyAttack?.target.ownerId).toBe("enemy-1");
    const focused = analyzeOwnedFrontierTargetsFromLookup(tiles, owned, "ai-1", { nowMs: 0, victoryFocusTargets: new Map([["leader-1", 1]]) });
    expect(focused.enemyAttack?.target.ownerId).toBe("leader-1");
  });

  // Regression (review of #2664): the bonus sat inside attack.score, which is
  // also pressureAttackScore, so a holding leader's lone border tile read as
  // a core threat (>=420), flipped BREAK/WAR and unlocked starving attacks.
  it("is a target preference only, never extra pressure on the AI's own core", () => {
    const tiles = new Map([
      ["10,10", { x: 10, y: 10, terrain: "LAND" as const, ownerId: "ai-1", ownershipState: "SETTLED" }],
      ["9,9", { x: 9, y: 9, terrain: "LAND" as const, ownerId: "leader-1", ownershipState: "SETTLED" }]
    ]);
    const owned = [tiles.get("10,10")!];
    const plain = analyzeOwnedFrontierTargetsFromLookup(tiles, owned, "ai-1", { nowMs: 0 });
    const focused = analyzeOwnedFrontierTargetsFromLookup(tiles, owned, "ai-1", { nowMs: 0, victoryFocusTargets: new Map([["leader-1", 1]]) });
    expect(focused.attack!.score).toBeGreaterThan(plain.attack!.score);
    expect(threatScoreOf(focused.attack)).toBe(threatScoreOf(plain.attack));
    const snapshotOf = (attack: NonNullable<typeof plain.attack>) =>
      buildAutomationStrategicSnapshot({
        playerId: "ai-1",
        points: 500,
        manpower: 100,
        settledTileCount: 4,
        controlledTileCount: 4,
        townCount: 1,
        incomePerMinute: 5 / 288,
        ownedTiles: owned,
        tilesByKey: tiles,
        canAttack: true,
        canExpand: true,
        economicBuildAvailable: false,
        fortBuildAvailable: false,
        siegeBatteryBuildAvailable: false,
        needsFood: false,
        needsEconomy: false,
        frontierAnalysis: {
          attack,
          enemyAttack: attack,
          frontierEnemyTargetCount: 1,
          frontierEnemyPlayerTargetCount: 1,
          frontierBarbarianTargetCount: 0,
          frontierNeutralTargetCount: 5,
          frontierOpportunityEconomic: 1,
          frontierOpportunityTownSupport: 0,
          frontierOpportunityScout: 0,
          frontierOpportunityScaffold: 0,
          frontierOpportunityWaste: 0,
          narrowAnalyzeCapped: false,
          neighborCandidateTotal: 0,
          missingNeighborTileCount: 0
        }
      });
    const plainSnapshot = snapshotOf(plain.attack!);
    const focusedSnapshot = snapshotOf(focused.attack!);
    expect(focusedSnapshot.pressureAttackScore).toBe(plainSnapshot.pressureAttackScore);
    expect(focusedSnapshot.pressureThreatensCore).toBe(false);
    expect(focusedSnapshot.frontPosture).toBe(plainSnapshot.frontPosture);
  });

  // Regression (review of #2664): a stalemated leader tile kept the bonus,
  // pinned enemyAttack and vetoed ATTACK/MUSTER against every other rival.
  it("gives a stalemated leader tile no bonus so another rival can still be attacked", () => {
    const tiles = new Map([
      ["10,10", { x: 10, y: 10, terrain: "LAND" as const, ownerId: "ai-1", ownershipState: "SETTLED" }],
      ["11,11", { x: 11, y: 11, terrain: "LAND" as const, ownerId: "ai-1", ownershipState: "SETTLED" }],
      // enemy-1 touches both of ai-1's tiles: the better target on merit.
      ["11,10", { x: 11, y: 10, terrain: "LAND" as const, ownerId: "enemy-1", ownershipState: "SETTLED" }],
      ["9,9", { x: 9, y: 9, terrain: "LAND" as const, ownerId: "leader-1", ownershipState: "SETTLED" }]
    ]);
    const owned = [tiles.get("10,10")!, tiles.get("11,11")!];
    const focus = new Map([["leader-1", 1]]);
    expect(analyzeOwnedFrontierTargetsFromLookup(tiles, owned, "ai-1", { nowMs: 0, victoryFocusTargets: focus }).enemyAttack?.target.ownerId).toBe("leader-1");
    const stalemated = analyzeOwnedFrontierTargetsFromLookup(tiles, owned, "ai-1", {
      nowMs: 0,
      victoryFocusTargets: focus,
      attackStalemateTargetTileKeys: new Set(["9,9"])
    });
    expect(stalemated.enemyAttack?.target.ownerId).toBe("enemy-1");
  });
});

const BASE: DecisionInputs = {
  points: 80,
  manpower: 100,
  canAttack: true,
  canExpand: true,
  frontierNeutralCount: 0,
  frontierEnemyCount: 1,
  frontierOpportunityEconomic: 0,
  expansionOpportunityCount: 3,
  hasActionableNonWasteExpand: true,
  hasExpansionObjective: false,
  hasOnlyScoutExpand: false,
  hasWeakEnemyBorder: false,
  hasBarbTarget: true,
  hasAnyExpandCandidate: true,
  hasAnyAttackCandidate: true,
  devSlotAvailable: true,
  attackReady: true,
  musterReady: false,
  frontPosture: "WAR",
  pressureAttackScore: 200,
  pressureThreatensCore: true,
  underThreat: true,
  needsEconomy: false,
  needsFood: false,
  hasEconomicBuild: true,
  hasFortBuild: true,
  hasSiegeBattery: false,
  hasRelayBeaconBuild: true,
  relayBeaconSiteValue: 20,
  beaconBoostActive: false,
  foodSlotsExhausted: false,
  hasFoodSlotReliefCandidate: false,
  hasFoodSlotReenableCandidate: false,
  techAffordable: false,
  momentumTicks: {},
  cooldown: {},
  stalemated: false,
  victoryFocusWeight: 0
};

const WAIT_CTX = { relayBeaconAffordable: true, frontierNonHostileTargetCount: 0 };
const CONTAINED: DecisionInputs = { ...BASE, frontPosture: "CONTAIN", hasBarbTarget: false, hasWeakEnemyBorder: true, pressureAttackScore: 60, pressureThreatensCore: false };

describe("ATTACK / MUSTER against a victory leader", () => {
  it("presses a contained front when the bordering rival holds a victory condition", () => {
    expect(scoreDecision("ATTACK", CONTAINED)).toBe(0);
    expect(vetoReasonsFor(CONTAINED, WAIT_CTX, ["ATTACK"]).ATTACK).toBe("posture_contain");
    const holding = { ...CONTAINED, victoryFocusWeight: 1 };
    expect(scoreDecision("ATTACK", holding)).toBeGreaterThan(0.3);
    expect(vetoReasonsFor(holding, WAIT_CTX, ["ATTACK"]).ATTACK).not.toMatch(/^posture_/);
  });

  it("does not lift the posture veto for a rival that is merely close to winning", () => {
    expect(scoreDecision("ATTACK", { ...CONTAINED, victoryFocusWeight: 0.5 })).toBe(0);
  });

  it("boosts MUSTER toward the leader but never revives a vetoed muster", () => {
    const ready = { ...CONTAINED, musterReady: true };
    expect(scoreDecision("MUSTER", { ...ready, victoryFocusWeight: 1 })).toBeGreaterThan(scoreDecision("MUSTER", ready));
    expect(scoreDecision("MUSTER", { ...ready, musterReady: false, victoryFocusWeight: 1 })).toBe(0);
  });
});
