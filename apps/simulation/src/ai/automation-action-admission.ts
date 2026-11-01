import { actionAdmissionKey } from "./ai-rejection-cooldown.js";
import type { AutomationNoopReason, AutomationPlannerDiagnostic, AutomationPlannerInput, AutomationPlannerResult, AutomationPlannerTile } from "./automation-command-planner-types.js";
import type { FoodSlotReliefPlan } from "./food-slot-relief.js";

export const cooldownsForAdmissions = <TTile extends AutomationPlannerTile>(input: AutomationPlannerInput<TTile>) => {
  // A rejected economic build must not suppress unrelated FOOD producers
  // or an exempt relay. Concrete selectors skip only the rejected action.
  return { ...(input.decisionCooldowns ?? {}) };
};

export const applyActionAdmission = <TTile extends AutomationPlannerTile>(options: {
  input: AutomationPlannerInput<TTile>;
  result: AutomationPlannerResult;
  foodSlotBlocked: boolean;
  foodSlotReliefTarget: FoodSlotReliefPlan | undefined;
}): AutomationPlannerResult => {
  const { input, result, foodSlotBlocked, foodSlotReliefTarget } = options;
  if (result.command && input.blockedActionKeys?.has(actionAdmissionKey(result.command))) {
    const blockedCode = input.blockedActionKeys.get(actionAdmissionKey(result.command));
    return {
      diagnostic: {
        ...result.diagnostic,
        noCommandReason: blockedCode === "INSUFFICIENT_SLOT" && foodSlotBlocked ? "BLOCKED_NO_FOOD_SLOT_RELIEF" : "BLOCKED_ACTION_RETRY"
      }
    };
  }
  const reason = result.diagnostic.noCommandReason;
  const namedWait = reason?.startsWith("WAIT_") ?? false;
  if (input.sessionPrefix !== "ai-runtime" || result.command || (reason !== "wait_and_recover" && !namedWait)) return result;
  if (foodSlotBlocked && !foodSlotReliefTarget) {
    return { ...result, diagnostic: { ...result.diagnostic, noCommandReason: "BLOCKED_NO_FOOD_SLOT_RELIEF" } };
  }
  const noFrontierOrEnemy = input.frontierTiles.length === 0 &&
    result.diagnostic.frontierEnemyTargetCount === 0 && result.diagnostic.frontierNeutralTargetCount === 0;
  // No frontier at all outranks any beacon reason; otherwise wait-reasons.ts
  // already named the blocker and the fallback below only labels unexplained waits.
  if (namedWait && !noFrontierOrEnemy) return result;
  const noActionReason: AutomationNoopReason = noFrontierOrEnemy
    ? "BLOCKED_NO_FRONTIER_OR_ENEMY_TARGET"
    : input.frontierTiles.length > 0
      ? "BLOCKED_NO_REACHABLE_BEACON_SITE"
      : "wait_and_recover";
  return { ...result, diagnostic: { ...result.diagnostic, noCommandReason: noActionReason } satisfies AutomationPlannerDiagnostic };
};
