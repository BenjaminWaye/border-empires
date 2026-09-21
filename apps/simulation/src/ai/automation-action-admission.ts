import { actionAdmissionKey } from "./ai-rejection-cooldown.js";
import type { AutomationNoopReason, AutomationPlannerDiagnostic, AutomationPlannerInput, AutomationPlannerResult, AutomationPlannerTile } from "./automation-command-planner-types.js";
import type { FoodSlotReliefPlan } from "./food-slot-relief.js";

export const cooldownsForAdmissions = <TTile extends AutomationPlannerTile>(input: AutomationPlannerInput<TTile>) => {
  const cooldowns = { ...(input.decisionCooldowns ?? {}) };
  for (const [actionKey, code] of input.blockedActionKeys ?? []) {
    if (code !== "INSUFFICIENT_SLOT") continue;
    if (actionKey.startsWith("BUILD_ECONOMIC_STRUCTURE:")) {
      cooldowns.BUILD_ECONOMY = true;
      cooldowns.BUILD_BEACON = true;
    }
    if (actionKey.startsWith("UPGRADE_TOWN_TIER:")) cooldowns.UPGRADE_TOWN_TIER = true;
  }
  return cooldowns;
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
        noCommandReason: blockedCode === "INSUFFICIENT_SLOT" ? "BLOCKED_NO_FOOD_SLOT_RELIEF" : "BLOCKED_NO_REACHABLE_BEACON_SITE"
      }
    };
  }
  if (input.sessionPrefix !== "ai-runtime" || result.command || result.diagnostic.noCommandReason !== "wait_and_recover") return result;
  if (foodSlotBlocked && !foodSlotReliefTarget) {
    return { ...result, diagnostic: { ...result.diagnostic, noCommandReason: "BLOCKED_NO_FOOD_SLOT_RELIEF" } };
  }
  const noFrontierOrEnemy = input.frontierTiles.length === 0 &&
    result.diagnostic.frontierEnemyTargetCount === 0 && result.diagnostic.frontierNeutralTargetCount === 0;
  const noActionReason: AutomationNoopReason = noFrontierOrEnemy
    ? "BLOCKED_NO_FRONTIER_OR_ENEMY_TARGET"
    : input.frontierTiles.length > 0
      ? "BLOCKED_NO_REACHABLE_BEACON_SITE"
      : "wait_and_recover";
  return { ...result, diagnostic: { ...result.diagnostic, noCommandReason: noActionReason } satisfies AutomationPlannerDiagnostic };
};
