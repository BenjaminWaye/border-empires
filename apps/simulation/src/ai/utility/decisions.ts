/**
 * Utility AI — decision scoring.
 *
 * Each DecisionClass has a set of considerations (response curves) that
 * multiply together (+ IAUS compensation) to produce a [0, 1] score.
 * A single boolVeto(false) collapses the product to 0 — the action is
 * unavailable.
 *
 * scoreDecision is the only public surface; utility-policy.ts calls it
 * for every class each tick and picks the winner.
 */

import { FRONTIER_CLAIM_COST, SETTLE_COST } from "@border-empires/shared";

import type { AutomationFrontPosture } from "../automation-strategic-snapshot.js";
import { boolVeto, linear, logistic, scoreConsiderations } from "./considerations.js";

export const DECISION_CLASSES = [
  "SETTLE",
  "EXPAND",
  "ATTACK",
  "MUSTER",
  "BUILD_DEFENSE",
  "BUILD_ECONOMY",
  "CHOOSE_TECH",
  "WAIT"
] as const;
export type DecisionClass = (typeof DECISION_CLASSES)[number];

export type DecisionInputs = {
  // Resource state
  points: number;
  manpower: number;
  // Frontier analysis
  canAttack: boolean;
  canExpand: boolean;
  frontierNeutralCount: number;
  frontierEnemyCount: number;
  frontierOpportunityEconomic: number;
  hasWeakEnemyBorder: boolean;
  hasBarbTarget: boolean;
  // Settlement
  hasSettlementCandidate: boolean;
  devSlotAvailable: boolean;
  // Strategic snapshot outputs
  attackReady: boolean;
  musterReady: boolean;
  frontPosture: AutomationFrontPosture;
  pressureAttackScore: number;
  pressureThreatensCore: boolean;
  underThreat: boolean;
  // Economy heuristics
  needsEconomy: boolean;
  needsFood: boolean;
  // Build candidates
  hasEconomicBuild: boolean;
  hasFortBuild: boolean;
  hasSiegeOutpost: boolean;
  // Tech
  techAffordable: boolean;
  // Anti-thrash: momentum ticks accrued since last class switch (0–N).
  // Added as a small flat bonus on top of the consideration product.
  momentumTicks: Partial<Record<DecisionClass, number>>;
  // Cooldown: class is on cooldown this tick — treated as a veto.
  cooldown: Partial<Record<DecisionClass, boolean>>;
  // Misc
  stalemated: boolean;
};

// ── Momentum ────────────────────────────────────────────────────────────────
// Each tick the AI stays on the same class it earns a small inertia bonus.
// This avoids SETTLE/EXPAND oscillation without hard quotas.
// Capped so it can never flip a vetoced (score 0) action to a winner.
const MOMENTUM_PER_TICK = 0.04;
const MOMENTUM_MAX = 0.20;

const momentumBonus = (cls: DecisionClass, inp: DecisionInputs): number =>
  Math.min(MOMENTUM_MAX, (inp.momentumTicks[cls] ?? 0) * MOMENTUM_PER_TICK);

// ── Per-decision consideration sets ─────────────────────────────────────────

const scoreSettle = (inp: DecisionInputs): number =>
  scoreConsiderations([
    boolVeto(inp.hasSettlementCandidate),
    boolVeto(inp.devSlotAvailable),
    // Settling into core pressure is wasteful — fall through to attack/expand
    boolVeto(!inp.pressureThreatensCore),
    // Comfortable gold cushion above the settle cost raises confidence
    linear(inp.points, SETTLE_COST, SETTLE_COST + 250),
    // Economy pressure lowers settle attractiveness (income first)
    1 - linear(inp.needsEconomy ? 1 : 0, 0, 1) * 0.4
  ]);

const scoreExpand = (inp: DecisionInputs): number =>
  scoreConsiderations([
    boolVeto(inp.canExpand),
    // Even a single neutral opportunity is strong evidence to expand.
    // Range of 2 means 1 neutral → 0.5, ≥2 → 1.0, 0 → 0 (natural veto).
    linear(inp.frontierNeutralCount + inp.frontierOpportunityEconomic, 0, 2),
    // Expand is still attractive under moderate threat if neutrals exist;
    // heavy pressure (core threatened) only allows it when there's a direct
    // economic opportunity to stabilise
    boolVeto(!inp.pressureThreatensCore || inp.frontierOpportunityEconomic > 0)
  ]);

const scoreAttack = (inp: DecisionInputs): number =>
  scoreConsiderations([
    boolVeto(inp.canAttack),
    boolVeto(inp.frontierEnemyCount > 0),
    boolVeto(inp.attackReady),
    boolVeto(!inp.musterReady),          // muster system handles it via MUSTER class
    boolVeto(!inp.stalemated),
    boolVeto(inp.frontPosture === "BREAK"),
    // Scales with how hard the enemy is pressing
    logistic(inp.pressureAttackScore, 150, 0.015)
  ]);

const scoreMuster = (inp: DecisionInputs): number =>
  scoreConsiderations([
    boolVeto(inp.musterReady),
    boolVeto(inp.hasWeakEnemyBorder),
    boolVeto(!inp.stalemated),
    logistic(inp.pressureAttackScore, 120, 0.015)
  ]);

const scoreBuildDefense = (inp: DecisionInputs): number =>
  scoreConsiderations([
    boolVeto(inp.hasFortBuild || inp.hasSiegeOutpost),
    boolVeto(inp.frontierEnemyCount > 0),
    boolVeto(inp.devSlotAvailable),
    // Only worth spending a slot when there's meaningful attack pressure
    logistic(inp.pressureAttackScore, 160, 0.018)
  ]);

const scoreBuildEconomy = (inp: DecisionInputs): number =>
  scoreConsiderations([
    boolVeto(inp.hasEconomicBuild),
    boolVeto(inp.devSlotAvailable),
    // Economy build is unattractive while expansion / attack is available.
    // Sharp suppression: 1 neutral already cuts BUILD_ECONOMY by ~67%;
    // ≥2 frontier tiles push it to 0, matching the spirit of hasHigherPriorityAction
    // but via competition rather than a hard gate.
    1 - linear(inp.frontierNeutralCount + inp.frontierEnemyCount, 0, 1.5),
    // Scales up when income is genuinely weak
    logistic(inp.needsEconomy ? 1 : inp.needsFood ? 0.6 : 0.2, 0.3, 6)
  ]);

const scoreChooseTech = (inp: DecisionInputs): number =>
  scoreConsiderations([
    boolVeto(inp.techAffordable),
    boolVeto(!inp.pressureThreatensCore),
    // Only tech up when sitting on a comfortable gold reserve
    linear(inp.points, SETTLE_COST + FRONTIER_CLAIM_COST, SETTLE_COST * 3)
  ]);

// ── Public API ───────────────────────────────────────────────────────────────

const CORE_SCORERS: Record<Exclude<DecisionClass, "WAIT">, (inp: DecisionInputs) => number> = {
  SETTLE: scoreSettle,
  EXPAND: scoreExpand,
  ATTACK: scoreAttack,
  MUSTER: scoreMuster,
  BUILD_DEFENSE: scoreBuildDefense,
  BUILD_ECONOMY: scoreBuildEconomy,
  CHOOSE_TECH: scoreChooseTech
};

/**
 * Score a single decision class.
 *
 * Returns 0 if the class is on cooldown.
 * WAIT is handled by the policy (it needs all other scores first).
 */
export const scoreDecision = (cls: Exclude<DecisionClass, "WAIT">, inp: DecisionInputs): number => {
  if (inp.cooldown[cls]) return 0;
  const base = CORE_SCORERS[cls](inp);
  if (base === 0) return 0;          // vetoed — momentum can't rescue it
  return Math.min(1, base + momentumBonus(cls, inp));
};
