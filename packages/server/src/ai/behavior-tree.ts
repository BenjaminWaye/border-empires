import type { AiDoctrineDecision, AiRewriteContext, AiRewriteDecision, AiRewriteIntentKey } from "./rewrite-types.js";
import { chooseAiRewriteIntent } from "./utility-ai.js";

export type AiBehaviorTreeStatus = "success" | "failure";

export type AiBehaviorTreeAction =
  | "wait"
  | "recover_economy"
  | "expand_frontier"
  | "settle_frontier"
  | "fortify_chokepoint"
  | "pressure_enemy"
  | "clear_barbarians"
  | "collect_shard"
  | "manage_truce";

export type AiBehaviorTreeResult = {
  status: AiBehaviorTreeStatus;
  doctrine: AiDoctrineDecision;
  intent: AiRewriteIntentKey;
  action: AiBehaviorTreeAction;
  reason: string;
  utility: AiRewriteDecision["utility"];
};

type AiLeaf = {
  type: "leaf";
  action: AiBehaviorTreeAction;
  canRun: (ctx: AiRewriteContext) => boolean;
  reason: string;
};

type AiSelector = {
  type: "selector";
  children: AiNode[];
};

type AiNode = AiLeaf | AiSelector;

const runNode = (ctx: AiRewriteContext, node: AiNode): { status: AiBehaviorTreeStatus; action?: AiBehaviorTreeAction; reason: string } => {
  if (node.type === "leaf") {
    if (!node.canRun(ctx)) return { status: "failure", reason: `${node.reason}_blocked` };
    return { status: "success", action: node.action, reason: node.reason };
  }

  for (const child of node.children) {
    const result = runNode(ctx, child);
    if (result.status === "success") return result;
  }

  return { status: "failure", reason: "no_child_succeeded" };
};

const treeForIntent = (intent: AiRewriteIntentKey): AiNode => {
  switch (intent) {
    case "SURVIVE":
      return {
        type: "selector",
        children: [
          { type: "leaf", action: "manage_truce", canRun: (ctx) => ctx.frontPosture === "TRUCE" && (ctx.truceRequestAvailable || ctx.truceAcceptanceAvailable), reason: "survive_via_truce" },
          { type: "leaf", action: "fortify_chokepoint", canRun: (ctx) => ctx.canBuildFort && ctx.fortProtectsCore, reason: "survive_via_fortify" },
          { type: "leaf", action: "settle_frontier", canRun: (ctx) => ctx.canAffordSettlement && ctx.settlementAvailable && ctx.foodCoverageLow, reason: "survive_via_food_settlement" },
          { type: "leaf", action: "recover_economy", canRun: (ctx) => ctx.canBuildEconomy && ctx.economicBuildAvailable, reason: "survive_via_economy" },
          { type: "leaf", action: "wait", canRun: () => true, reason: "survive_wait" }
        ]
      };
    case "RECOVER_ECONOMY":
      return {
        type: "selector",
        children: [
          { type: "leaf", action: "recover_economy", canRun: (ctx) => ctx.canBuildEconomy && ctx.economicBuildAvailable, reason: "economic_build" },
          { type: "leaf", action: "settle_frontier", canRun: (ctx) => ctx.canAffordSettlement && (ctx.settlementAvailable || ctx.townSupportSettlementAvailable), reason: "economic_settlement" },
          { type: "leaf", action: "expand_frontier", canRun: (ctx) => ctx.canAffordFrontierAction && (ctx.economicExpandAvailable || ctx.neutralExpandAvailable), reason: "economic_expand" },
          { type: "leaf", action: "wait", canRun: () => true, reason: "economic_wait" }
        ]
      };
    case "EXPAND_FRONTIER":
      return {
        type: "selector",
        children: [
          { type: "leaf", action: "expand_frontier", canRun: (ctx) => ctx.canAffordFrontierAction && (ctx.economicExpandAvailable || ctx.neutralExpandAvailable || ctx.scoutExpandAvailable || ctx.scaffoldExpandAvailable || ctx.islandExpandAvailable), reason: "expand_frontier" },
          { type: "leaf", action: "settle_frontier", canRun: (ctx) => ctx.canAffordSettlement && ctx.settlementAvailable, reason: "expand_to_settlement" },
          { type: "leaf", action: "wait", canRun: () => true, reason: "expand_wait" }
        ]
      };
    case "SETTLE_FRONTIER":
      return {
        type: "selector",
        children: [
          { type: "leaf", action: "settle_frontier", canRun: (ctx) => ctx.canAffordSettlement && (ctx.settlementAvailable || ctx.townSupportSettlementAvailable || ctx.islandSettlementAvailable), reason: "settle_frontier" },
          { type: "leaf", action: "expand_frontier", canRun: (ctx) => ctx.canAffordFrontierAction && (ctx.economicExpandAvailable || ctx.islandExpandAvailable), reason: "settle_expand_setup" },
          { type: "leaf", action: "wait", canRun: () => true, reason: "settle_wait" }
        ]
      };
    case "FORTIFY_CHOKEPOINT":
      return {
        type: "selector",
        children: [
          { type: "leaf", action: "fortify_chokepoint", canRun: (ctx) => ctx.canBuildFort && ctx.fortAvailable, reason: "fortify_chokepoint" },
          { type: "leaf", action: "pressure_enemy", canRun: (ctx) => ctx.canAffordFrontierAction && ctx.enemyAttackAvailable && ctx.frontPosture === "BREAK", reason: "fortify_pressure_fallback" },
          { type: "leaf", action: "wait", canRun: () => true, reason: "fortify_wait" }
        ]
      };
    case "PRESSURE_ENEMY":
      return {
        type: "selector",
        children: [
          { type: "leaf", action: "pressure_enemy", canRun: (ctx) => ctx.canAffordFrontierAction && ctx.enemyAttackAvailable && ctx.frontPosture !== "TRUCE", reason: "pressure_enemy" },
          { type: "leaf", action: "clear_barbarians", canRun: (ctx) => ctx.canAffordFrontierAction && ctx.barbarianAttackAvailable, reason: "pressure_barbarian_fallback" },
          { type: "leaf", action: "wait", canRun: () => true, reason: "pressure_wait" }
        ]
      };
    case "CLEAR_BARBARIANS":
      return {
        type: "selector",
        children: [
          { type: "leaf", action: "clear_barbarians", canRun: (ctx) => ctx.canAffordFrontierAction && ctx.barbarianAttackAvailable, reason: "clear_barbarians" },
          { type: "leaf", action: "expand_frontier", canRun: (ctx) => ctx.canAffordFrontierAction && ctx.neutralExpandAvailable, reason: "barbarian_expand_fallback" },
          { type: "leaf", action: "wait", canRun: () => true, reason: "barbarian_wait" }
        ]
      };
    case "COLLECT_SHARD":
      return {
        type: "selector",
        children: [
          { type: "leaf", action: "collect_shard", canRun: (ctx) => ctx.shardAvailable, reason: "collect_shard" },
          { type: "leaf", action: "wait", canRun: () => true, reason: "shard_wait" }
        ]
      };
    case "MANAGE_TRUCE":
      return {
        type: "selector",
        children: [
          { type: "leaf", action: "manage_truce", canRun: (ctx) => ctx.truceRequestAvailable || ctx.truceAcceptanceAvailable, reason: "manage_truce" },
          { type: "leaf", action: "wait", canRun: () => true, reason: "truce_wait" }
        ]
      };
    case "WAIT":
      return {
        type: "selector",
        children: [{ type: "leaf", action: "wait", canRun: () => true, reason: "wait" }]
      };
  }
};

export const evaluateAiBehaviorTree = (ctx: AiRewriteContext, doctrineDecision?: AiDoctrineDecision): AiBehaviorTreeResult => {
  const decision = chooseAiRewriteIntent(ctx, doctrineDecision);
  const tree = treeForIntent(decision.intent);
  const result = runNode(ctx, tree);
  return {
    status: result.status,
    doctrine: decision.doctrine,
    intent: decision.intent,
    action: result.action ?? "wait",
    reason: result.reason,
    utility: decision.utility
  };
};
