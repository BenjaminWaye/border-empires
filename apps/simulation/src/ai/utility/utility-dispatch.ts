/**
 * Utility AI Phase 1 — dispatch layer.
 *
 * Bridges between the utility policy (which scores DecisionClasses) and the
 * existing concrete command builders. The planner computes all candidates
 * (frontier, settlement, builds) exactly as before; this module just chooses
 * which one to act on using utility scores instead of the GOAP waterfall.
 *
 * Entry point: runUtilityPolicy(). Everything else is internal.
 */

import type { AutomationPlannerResult, AutomationPlannerTile } from "../automation-command-planner.js";
import type { AutomationPlannerDecisionContext } from "../automation-command-planner-helpers.js";
import {
  buildPlannerCommand,
  buildPlannerFrontierCommand
} from "../automation-command-planner-helpers.js";
import type { AutomationStrategicSnapshot } from "../automation-strategic-snapshot.js";
import type { FrontierAnalysis } from "../frontier-command-planner.js";
import type {
  chooseBestEconomicBuild,
  chooseBestFortBuild,
  chooseBestSiegeOutpostBuild
} from "../structure-command-planner.js";
import type { DecisionClass, DecisionInputs } from "./decisions.js";
import { evaluateUtilityPolicy } from "./utility-policy.js";

// ── State type ───────────────────────────────────────────────────────────────

export type UtilityDispatchState<TTile extends AutomationPlannerTile> = {
  // context already carries settlementCandidate, fallbackSettlementCandidate,
  // frontierAnalysis, needsFood, needsEconomy
  context: AutomationPlannerDecisionContext<TTile>;
  strategic: AutomationStrategicSnapshot;
  canAttack: boolean;
  canExpand: boolean;
  devSlotAvailable: boolean;
  preferredEnemyAttack: FrontierAnalysis["attack"] | undefined;
  economicBuild: ReturnType<typeof chooseBestEconomicBuild> | undefined;
  fortBuild: ReturnType<typeof chooseBestFortBuild> | undefined;
  siegeOutpostBuild: ReturnType<typeof chooseBestSiegeOutpostBuild> | undefined;
  attackStalemateTargetTileKeys: ReadonlySet<string> | undefined;
  expansionObjective: { x: number; y: number; kind: "neutral_value" | "enemy" } | undefined;
  points: number;
  manpower: number;
  decisionCooldowns: Partial<Record<DecisionClass, boolean>> | undefined;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const targetStalemated = <TTile extends AutomationPlannerTile>(
  sel: FrontierAnalysis["attack"] | undefined,
  state: UtilityDispatchState<TTile>
): boolean =>
  Boolean(sel && state.attackStalemateTargetTileKeys?.has(`${sel.target.x},${sel.target.y}`));

// ── Input builder ─────────────────────────────────────────────────────────────

export const buildDecisionInputs = <TTile extends AutomationPlannerTile>(
  state: UtilityDispatchState<TTile>
): DecisionInputs => {
  const { context, strategic, canAttack, canExpand } = state;
  const fa = context.frontierAnalysis;

  // Fold stalemate into the scoring canAttack so ATTACK can use 5
  // considerations instead of 6 (keeping compensation parity with EXPAND).
  const scoringCanAttack = canAttack && !targetStalemated(state.preferredEnemyAttack, state);

  return {
    points: state.points,
    manpower: state.manpower,
    canAttack: scoringCanAttack,
    canExpand,
    frontierNeutralCount: fa.frontierNeutralTargetCount,
    frontierEnemyCount: fa.frontierEnemyTargetCount,
    frontierOpportunityEconomic: fa.frontierOpportunityEconomic,
    expansionOpportunityCount:
      fa.frontierNeutralTargetCount +
      fa.frontierOpportunityEconomic +
      fa.frontierOpportunityTownSupport +
      fa.frontierOpportunityScout +
      fa.frontierOpportunityScaffold,
    hasWeakEnemyBorder:
      fa.frontierEnemyPlayerTargetCount > 0 && !targetStalemated(fa.enemyAttack, state),
    hasBarbTarget:
      fa.frontierBarbarianTargetCount > 0 && !targetStalemated(fa.barbarianAttack, state),
    hasActionableNonWasteExpand:
      fa.frontierOpportunityEconomic > 0 ||
      fa.frontierOpportunityTownSupport > 0 ||
      fa.frontierOpportunityScaffold > 0,
    hasExpansionObjective: state.expansionObjective !== undefined,
    hasOnlyScoutExpand:
      fa.frontierOpportunityScout > 0 &&
      !(fa.frontierOpportunityEconomic > 0 ||
        fa.frontierOpportunityTownSupport > 0 ||
        fa.frontierOpportunityScaffold > 0),
    devSlotAvailable: state.devSlotAvailable,
    attackReady: strategic.attackReady,
    musterReady: strategic.musterReady,
    frontPosture: strategic.frontPosture,
    pressureAttackScore: strategic.pressureAttackScore,
    pressureThreatensCore: strategic.pressureThreatensCore,
    underThreat: strategic.underThreat,
    needsEconomy: context.needsEconomy,
    needsFood: context.needsFood,
    hasEconomicBuild: Boolean(state.economicBuild),
    hasFortBuild: Boolean(state.fortBuild),
    hasSiegeOutpost: Boolean(state.siegeOutpostBuild),
    // Preplan handles tech selection; CHOOSE_TECH always scores 0 in the main planner.
    techAffordable: false,
    momentumTicks: {},
    cooldown: state.decisionCooldowns ?? {},
    stalemated: targetStalemated(state.preferredEnemyAttack, state)
  };
};

// ── Class executor ────────────────────────────────────────────────────────────

const executeClass = <TTile extends AutomationPlannerTile>(
  cls: DecisionClass,
  state: UtilityDispatchState<TTile>
): AutomationPlannerResult | undefined => {
  const { context, strategic, canAttack, canExpand } = state;
  const fa = context.frontierAnalysis;
  const notStalemated = (sel: FrontierAnalysis["attack"] | undefined): boolean =>
    !targetStalemated(sel, state);

  switch (cls) {
    case "EXPAND":
      // Priority order mirrors the existing waterfall
      if (fa.economicExpand && canExpand) return buildPlannerFrontierCommand(context, fa.economicExpand, "EXPAND");
      if (fa.directedExpand && canExpand) return buildPlannerFrontierCommand(context, fa.directedExpand, "EXPAND");
      if (fa.townSupportExpand && canExpand && strategic.townSupportExpandAvailable) {
        return buildPlannerFrontierCommand(context, fa.townSupportExpand, "EXPAND");
      }
      if (fa.expand && canExpand) return buildPlannerFrontierCommand(context, fa.expand, "EXPAND");
      if (fa.scaffoldExpand && canExpand) return buildPlannerFrontierCommand(context, fa.scaffoldExpand, "EXPAND");
      if (fa.scoutExpand && canExpand) return buildPlannerFrontierCommand(context, fa.scoutExpand, "EXPAND");
      return undefined;

    case "ATTACK": {
      // Defer to MUSTER only when it can actually engage an enemy-*player*
      // border (mirrors scoreAttack). Muster is a player-vs-player mechanic, so
      // a barbarian-only front must NOT defer — otherwise ATTACK scores highest
      // but produces no command and the planner falls through to WAIT
      // (the ATTACK↔MUSTER execution-path deadlock).
      const musterWillHandle =
        strategic.musterReady &&
        fa.frontierEnemyPlayerTargetCount > 0 &&
        notStalemated(fa.enemyAttack);
      const canDirectAttack = canAttack && strategic.attackReady && !musterWillHandle;
      if (state.preferredEnemyAttack && notStalemated(state.preferredEnemyAttack) && canDirectAttack) {
        return buildPlannerFrontierCommand(context, state.preferredEnemyAttack, "ATTACK");
      }
      if (fa.barbarianAttack && notStalemated(fa.barbarianAttack) && canDirectAttack) {
        return buildPlannerFrontierCommand(context, fa.barbarianAttack, "ATTACK");
      }
      return undefined;
    }

    case "MUSTER": {
      const target = fa.enemyAttack;
      if (target && strategic.musterReady && notStalemated(target) && fa.frontierEnemyPlayerTargetCount > 0) {
        return buildPlannerCommand(context, "SET_MUSTER", {
          x: target.from.x,
          y: target.from.y,
          mode: "ADVANCE"
        });
      }
      return undefined;
    }

    case "BUILD_DEFENSE":
      if (state.fortBuild && fa.frontierEnemyTargetCount > 0) {
        return buildPlannerCommand(context, "BUILD_FORT", {
          x: state.fortBuild.x,
          y: state.fortBuild.y
        });
      }
      if (state.siegeOutpostBuild && state.preferredEnemyAttack) {
        return buildPlannerCommand(context, "BUILD_SIEGE_OUTPOST", {
          x: state.siegeOutpostBuild.x,
          y: state.siegeOutpostBuild.y
        });
      }
      return undefined;

    case "BUILD_ECONOMY":
      if (state.economicBuild) {
        return buildPlannerCommand(context, "BUILD_ECONOMIC_STRUCTURE", {
          x: state.economicBuild.tile.x,
          y: state.economicBuild.tile.y,
          structureType: state.economicBuild.structureType
        });
      }
      return undefined;

    case "CHOOSE_TECH":
      return undefined; // handled by preplan

    case "WAIT":
      return { diagnostic: { ...context.diagnostic, noCommandReason: "wait_and_recover" } };
  }
};

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Scores all decision classes via the utility policy, then executes them in
 * descending score order until one produces a command.  WAIT always produces
 * a command (wait_and_recover diagnostic), so this function always returns.
 */
export const runUtilityPolicy = <TTile extends AutomationPlannerTile>(
  state: UtilityDispatchState<TTile>
): AutomationPlannerResult => {
  const inputs = buildDecisionInputs(state);
  const policy = evaluateUtilityPolicy(inputs);

  const sorted = (Object.entries(policy.scores) as Array<[DecisionClass, number]>)
    .filter(([, s]) => s > 0)
    .sort(([, a], [, b]) => b - a);

  // Attach the full score map to the diagnostic so the AI decision diagnostics
  // endpoint can show why every class scored 0. The diagnostic (not this Map)
  // is what crosses the AI-worker → sim-worker boundary, so recording must
  // happen sim-side from the diagnostic — see recordAiDecisionDiagnosticFromPlanner.
  const utilityBase = {
    utilityRunnerUp: policy.runnerUp,
    utilityRunnerUpScore: policy.runnerUpScore,
    utilityScores: policy.scores,
    utilityGates: {
      attackReady: state.strategic.attackReady,
      musterReady: state.strategic.musterReady,
      frontPosture: state.strategic.frontPosture,
      hasBarbTarget: inputs.hasBarbTarget,
      hasWeakEnemyBorder: inputs.hasWeakEnemyBorder,
      stalemated: inputs.stalemated,
      pressureAttackScore: inputs.pressureAttackScore
    },
    ...(policy.vetoedClasses.length > 0 ? { utilityVetoedClasses: policy.vetoedClasses } : {})
  };

  for (const [cls] of sorted) {
    const result = executeClass(cls, state);
    if (result) {
      // When WAIT wins and the dev slot is full, the limiting factor is the
      // development process cap — preserve the legacy diagnostic expected by tests.
      const noCommandReason =
        cls === "WAIT" && !state.devSlotAvailable && result.diagnostic.noCommandReason === "wait_and_recover"
          ? "development_process_limit"
          : result.diagnostic.noCommandReason;

      return {
        ...result,
        diagnostic: {
          ...result.diagnostic,
          ...(noCommandReason !== undefined ? { noCommandReason } : {}),
          utilityWinner: cls,
          utilityWinnerScore: policy.scores[cls],
          ...utilityBase
        }
      };
    }
  }

  // Unreachable in practice: WAIT always fires. Safety fallback.
  return {
    diagnostic: {
      ...state.context.diagnostic,
      noCommandReason: "wait_and_recover",
      utilityWinner: "WAIT" as const,
      utilityWinnerScore: policy.scores["WAIT"],
      ...utilityBase
    }
  };
};
