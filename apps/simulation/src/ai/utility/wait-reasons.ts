/**
 * Utility AI — why WAIT won.
 *
 * Every non-WAIT class in decisions.ts is a product of boolVeto gates plus a
 * graduated term. When they all score 0 the planner used to report one
 * catch-all reason (BLOCKED_NO_REACHABLE_BEACON_SITE for any WAIT with a
 * frontier), which said nothing about which gate actually held each class
 * back. This mirrors those gates, first failing gate per class, and picks the
 * one blocker that explains why the empire can't grow this tick.
 *
 * Mirror, not re-derive: when you change a veto in decisions.ts, change the
 * matching line here. wait-reasons.test.ts checks a class never reports a
 * veto reason while it still scores above 0.
 */

import type { AutomationNoopReason } from "../automation-command-planner-types.js";
import type { DecisionClass, DecisionInputs } from "./decisions.js";

export type WaitContext = {
  /** False when the next RELAY_BEACON's manpower (or other) cost can't be paid. */
  relayBeaconAffordable: boolean;
  /** Bordering tiles owned by allies/truce partners (skipped as targets). */
  frontierNonHostileTargetCount: number;
};

export type VetoReasons = Partial<Record<Exclude<DecisionClass, "WAIT">, string>>;

// Same floor scoreBuildBeacon's linear(relayBeaconSiteValue, ...) uses.
const RELAY_BEACON_SITE_VALUE_FLOOR = 1;

const atPeace = (inp: DecisionInputs, ctx: WaitContext): boolean =>
  inp.frontierEnemyCount === 0 && ctx.frontierNonHostileTargetCount > 0;

const expandVeto = (inp: DecisionInputs): string | undefined => {
  if (!inp.canExpand) return "reach_capped";
  if (!inp.hasAnyExpandCandidate) return "no_candidate";
  const objectiveOk = inp.frontPosture === "WAR" ? inp.hasExpansionObjective : inp.hasActionableNonWasteExpand || inp.hasExpansionObjective;
  if (!objectiveOk) return inp.frontPosture === "WAR" ? "war_needs_objective" : "only_waste_in_reach";
  return undefined;
};

const attackVeto = (inp: DecisionInputs, ctx: WaitContext): string | undefined => {
  if (!inp.hasAnyAttackCandidate) return atPeace(inp, ctx) ? "neighbors_at_peace" : "no_target";
  if (!inp.canAttack) return "cannot_attack";
  if (!inp.attackReady) return "not_ready";
  if (inp.musterReady && inp.hasWeakEnemyBorder) return "muster_handles_it";
  if (!(inp.frontPosture === "BREAK" || inp.frontPosture === "WAR" || inp.hasBarbTarget)) return `posture_${inp.frontPosture.toLowerCase()}`;
  return undefined;
};

const musterVeto = (inp: DecisionInputs, ctx: WaitContext): string | undefined => {
  if (!inp.musterReady) return "not_ready";
  if (!inp.hasWeakEnemyBorder) return atPeace(inp, ctx) ? "neighbors_at_peace" : "no_weak_enemy_border";
  if (inp.stalemated) return "stalemated";
  return undefined;
};

const buildDefenseVeto = (inp: DecisionInputs): string | undefined => {
  if (!(inp.hasFortBuild || inp.hasSiegeBattery)) return "no_site_or_unaffordable";
  if (inp.frontierEnemyCount <= 0) return "no_enemy_on_frontier";
  if (!inp.devSlotAvailable) return "no_dev_slot";
  return undefined;
};

const buildEconomyVeto = (inp: DecisionInputs): string | undefined => {
  if (!inp.hasEconomicBuild) return "no_site_or_unaffordable";
  if (!inp.devSlotAvailable) return "no_dev_slot";
  if (inp.frontierEnemyCount >= 1.5) return "enemy_at_gate";
  return undefined;
};

const buildBeaconVeto = (inp: DecisionInputs, ctx: WaitContext): string | undefined => {
  if (!ctx.relayBeaconAffordable) return "unaffordable";
  if (!inp.hasRelayBeaconBuild) return "no_site";
  if (!inp.devSlotAvailable) return "no_dev_slot";
  if (!(inp.frontPosture === "WAR" || inp.frontierEnemyCount === 0)) return "enemy_at_gate";
  if (inp.relayBeaconSiteValue <= RELAY_BEACON_SITE_VALUE_FLOOR) return "low_value_site";
  return undefined;
};

const freeFoodSlotVeto = (inp: DecisionInputs): string | undefined => {
  if (!(inp.foodSlotsExhausted || inp.hasFoodSlotReenableCandidate)) return "food_not_exhausted";
  if (!(inp.hasFoodSlotReliefCandidate || inp.hasFoodSlotReenableCandidate)) return "nothing_to_disable";
  if (inp.hasEconomicBuild) return "economic_build_preferred";
  if (inp.pressureThreatensCore) return "core_threatened";
  return undefined;
};

/** First failing gate per vetoed class; classes on cooldown report "cooldown". */
export const vetoReasonsFor = (inp: DecisionInputs, ctx: WaitContext, vetoed: readonly DecisionClass[]): VetoReasons => {
  const reasons: VetoReasons = {};
  for (const cls of vetoed) {
    if (cls === "WAIT") continue;
    const reason = inp.cooldown[cls]
      ? "cooldown"
      : cls === "EXPAND" ? expandVeto(inp)
      : cls === "ATTACK" ? attackVeto(inp, ctx)
      : cls === "MUSTER" ? musterVeto(inp, ctx)
      : cls === "BUILD_DEFENSE" ? buildDefenseVeto(inp)
      : cls === "BUILD_ECONOMY" ? buildEconomyVeto(inp)
      : cls === "BUILD_BEACON" ? buildBeaconVeto(inp, ctx)
      : cls === "FREE_FOOD_SLOT" ? freeFoodSlotVeto(inp)
      : "handled_by_preplan";
    reasons[cls] = reason ?? "low_score";
  }
  return reasons;
};

/**
 * The single reason recorded on sim_ai_noop_total when WAIT wins. Growth is
 * the question that matters for a stuck AI: EXPAND is reach-capped once the
 * in-reach land is taken, so the beacon is the way out and its blocker is
 * the reason. undefined = nothing specific (caller keeps wait_and_recover).
 */
export const primaryWaitReason = (inp: DecisionInputs, ctx: WaitContext): AutomationNoopReason | undefined => {
  if (!inp.devSlotAvailable) return "development_process_limit";
  if (expandVeto(inp) === undefined) return undefined;
  if (!ctx.relayBeaconAffordable) return "WAIT_BEACON_UNAFFORDABLE";
  if (!inp.hasRelayBeaconBuild) return atPeace(inp, ctx) ? "WAIT_BOXED_IN_AT_PEACE" : "WAIT_NO_BEACON_SITE";
  if (!(inp.frontPosture === "WAR" || inp.frontierEnemyCount === 0)) return "WAIT_BEACON_ENEMY_AT_GATE";
  if (inp.relayBeaconSiteValue <= RELAY_BEACON_SITE_VALUE_FLOOR) return "WAIT_BEACON_LOW_VALUE";
  return undefined;
};
