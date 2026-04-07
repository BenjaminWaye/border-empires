import { evaluateAiBehaviorTree } from "./behavior-tree.js";
import type { AiDoctrineDecision, AiDoctrineId, AiRewriteContext, AiRewriteIntentKey } from "./rewrite-types.js";
import { type AiPlanningDecision, type AiPlanningSnapshot } from "./planner-shared.js";

export type AiBrainMode = "goap" | "behavior_tree_utility" | "shadow";

export type AiPlannerContextExtras = {
  aiCount: number;
  pendingCaptures: number;
  pendingSettlement: boolean;
  simulationQueueBackpressure: boolean;
  workerQueueBackpressure: boolean;
  doctrineDecision?: AiDoctrineDecision;
};

export type AiPlannerDecisionEnvelope = {
  decision: AiPlanningDecision;
  brainMode: "goap" | "behavior_tree_utility";
  doctrineId?: AiDoctrineId;
  behaviorIntent?: AiRewriteIntentKey;
  behaviorAction?: string;
  shadow?: {
    actionKey?: string;
    reason: string;
    doctrineId?: AiDoctrineId;
    behaviorIntent?: AiRewriteIntentKey;
    behaviorAction?: string;
  };
};

export const buildRewriteContext = (
  snapshot: AiPlanningSnapshot,
  extras: AiPlannerContextExtras
): AiRewriteContext => ({
  ...(snapshot.primaryVictoryPath ? { primaryVictoryPath: snapshot.primaryVictoryPath } : {}),
  strategicFocus: snapshot.strategicFocus,
  frontPosture: snapshot.frontPosture,
  aiCount: extras.aiCount,
  points: snapshot.points,
  stamina: snapshot.stamina,
  aiIncome: snapshot.aiIncome,
  runnerUpIncome: snapshot.runnerUpIncome,
  controlledTowns: snapshot.controlledTowns,
  townsTarget: snapshot.townsTarget,
  settledTiles: snapshot.settledTiles,
  settledTilesTarget: snapshot.settledTilesTarget,
  frontierTiles: snapshot.frontierTiles,
  underThreat: snapshot.underThreat,
  threatCritical: snapshot.threatCritical,
  economyWeak: snapshot.economyWeak,
  frontierDebt: snapshot.frontierDebt,
  foodCoverage: snapshot.foodCoverage,
  foodCoverageLow: snapshot.foodCoverageLow,
  pressureAttackScore: snapshot.pressureAttackScore,
  pressureThreatensCore: snapshot.pressureThreatensCore,
  undercoveredIslandCount: snapshot.undercoveredIslandCount,
  weakestIslandRatio: snapshot.weakestIslandRatio,
  canAffordFrontierAction: snapshot.canAffordFrontierAction,
  canAffordSettlement: snapshot.canAffordSettlement,
  canBuildFort: snapshot.canBuildFort,
  canBuildEconomy: snapshot.canBuildEconomy,
  openingScoutAvailable: snapshot.openingScoutAvailable,
  economicExpandAvailable: snapshot.economicExpandAvailable,
  neutralExpandAvailable: snapshot.neutralExpandAvailable,
  scoutExpandAvailable: snapshot.scoutExpandAvailable,
  scaffoldExpandAvailable: snapshot.scaffoldExpandAvailable,
  barbarianAttackAvailable: snapshot.barbarianAttackAvailable,
  enemyAttackAvailable: snapshot.pressureAttackAvailable || snapshot.enemyAttackAvailable,
  settlementAvailable: snapshot.settlementAvailable,
  townSupportSettlementAvailable: snapshot.townSupportSettlementAvailable,
  islandSettlementAvailable: snapshot.islandSettlementAvailable,
  islandExpandAvailable: snapshot.islandExpandAvailable,
  fortAvailable: snapshot.fortAvailable,
  fortProtectsCore: snapshot.fortProtectsCore,
  fortIsDockChokePoint: snapshot.fortIsDockChokePoint,
  economicBuildAvailable: snapshot.economicBuildAvailable,
  shardAvailable: false,
  truceRequestAvailable: false,
  truceAcceptanceAvailable: false,
  pendingCaptures: extras.pendingCaptures,
  pendingSettlement: extras.pendingSettlement,
  simulationQueueBackpressure: extras.simulationQueueBackpressure,
  workerQueueBackpressure: extras.workerQueueBackpressure
});

const chooseExpandActionKey = (snapshot: AiPlanningSnapshot): AiPlanningDecision["actionKey"] => {
  if (snapshot.foodCoverageLow && snapshot.economicExpandAvailable) return "claim_food_border_tile";
  if (snapshot.openingScoutAvailable && !snapshot.economicExpandAvailable && !snapshot.neutralExpandAvailable) {
    return "opening_scout_expand";
  }
  if (snapshot.economicExpandAvailable || snapshot.neutralExpandAvailable || snapshot.islandExpandAvailable) {
    return "claim_neutral_border_tile";
  }
  if (snapshot.scoutExpandAvailable) return "claim_scout_border_tile";
  if (snapshot.scaffoldExpandAvailable) return "claim_scaffold_border_tile";
  return undefined;
};

const mapBehaviorActionToDecision = (
  snapshot: AiPlanningSnapshot,
  behaviorAction: string,
  behaviorIntent: AiRewriteIntentKey
): AiPlanningDecision => {
  switch (behaviorAction) {
    case "recover_economy":
      if (snapshot.economicBuildAvailable && snapshot.canBuildEconomy) {
        return {
          reason: "behavior_tree_recover_economy",
          actionKey: "build_economic_structure",
          goapActionKey: "build_economic_structure"
        };
      }
      const actionKey = chooseExpandActionKey(snapshot);
      return {
        reason: "behavior_tree_recover_economy",
        ...(actionKey ? { actionKey, goapActionKey: actionKey } : {})
      };
    case "expand_frontier": {
      const actionKey = chooseExpandActionKey(snapshot);
      return {
        reason: `behavior_tree_${behaviorIntent.toLowerCase()}`,
        ...(actionKey ? { actionKey, goapActionKey: actionKey } : {})
      };
    }
    case "settle_frontier":
      return {
        reason: "behavior_tree_settle_frontier",
        actionKey: "settle_owned_frontier_tile",
        goapActionKey: "settle_owned_frontier_tile"
      };
    case "fortify_chokepoint":
      return {
        reason: "behavior_tree_fortify_chokepoint",
        actionKey: "build_fort_on_exposed_tile",
        goapActionKey: "build_fort_on_exposed_tile"
      };
    case "pressure_enemy":
      return {
        reason: "behavior_tree_pressure_enemy",
        actionKey: "attack_enemy_border_tile",
        goapActionKey: "attack_enemy_border_tile"
      };
    case "clear_barbarians":
      return {
        reason: "behavior_tree_clear_barbarians",
        actionKey: "attack_barbarian_border_tile",
        goapActionKey: "attack_barbarian_border_tile"
      };
    case "collect_shard":
      return { reason: "behavior_tree_collect_shard" };
    case "manage_truce":
      return { reason: "behavior_tree_manage_truce" };
    case "wait":
    default:
      return { reason: "behavior_tree_wait" };
  }
};

const createBehaviorDecision = (
  snapshot: AiPlanningSnapshot,
  extras: AiPlannerContextExtras
): AiPlannerDecisionEnvelope => {
  const behavior = evaluateAiBehaviorTree(buildRewriteContext(snapshot, extras), extras.doctrineDecision);
  return {
    decision: mapBehaviorActionToDecision(snapshot, behavior.action, behavior.intent),
    brainMode: "behavior_tree_utility",
    doctrineId: behavior.doctrine.doctrineId,
    behaviorIntent: behavior.intent,
    behaviorAction: behavior.action
  };
};

export const planAiDecisionByBrain = async (
  snapshot: AiPlanningSnapshot,
  mode: AiBrainMode,
  extras: AiPlannerContextExtras,
  planGoapDecision: (snapshot: AiPlanningSnapshot) => Promise<AiPlanningDecision>
): Promise<AiPlannerDecisionEnvelope> => {
  if (mode === "behavior_tree_utility") return createBehaviorDecision(snapshot, extras);

  const goapDecision = await planGoapDecision(snapshot);
  if (mode === "goap") {
    return {
      decision: goapDecision,
      brainMode: "goap"
    };
  }

  const behaviorDecision = createBehaviorDecision(snapshot, extras);
  return {
    decision: goapDecision,
    brainMode: "goap",
    shadow: {
      reason: behaviorDecision.decision.reason,
      ...(behaviorDecision.doctrineId ? { doctrineId: behaviorDecision.doctrineId } : {}),
      ...(behaviorDecision.decision.actionKey ? { actionKey: behaviorDecision.decision.actionKey } : {}),
      ...(behaviorDecision.behaviorIntent ? { behaviorIntent: behaviorDecision.behaviorIntent } : {}),
      ...(behaviorDecision.behaviorAction ? { behaviorAction: behaviorDecision.behaviorAction } : {})
    }
  };
};
