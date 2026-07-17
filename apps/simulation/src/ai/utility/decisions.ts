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
  // Aggregate expansion signal across all opportunity types (neutral, economic,
  // town-support, scout, scaffold). Feeds the EXPAND linear curve — EXPAND's
  // own veto (hasAnyExpandCandidate / hasActionableNonWasteExpand below)
  // already gates out the waste-only case, so counting waste here just adds
  // texture once a real candidate is confirmed to exist.
  expansionOpportunityCount: number;
  // Same aggregate, but with waste-classified plain neutrals excluded (see
  // utility-dispatch.ts's buildDecisionInputs). Used by BUILD_ECONOMY's
  // suppression term instead of expansionOpportunityCount: that term exists
  // to defer economy-building "while expansion is available", and waste-only
  // neutrals are NOT available to EXPAND (it refuses them) — counting them
  // there suppressed BUILD_ECONOMY on the same tiles EXPAND was refusing to
  // touch, deadlocking a hemmed-in AI on WAIT despite an affordable, ready
  // economic build. See docs/agents/topics/ai-planner.md.
  nonWasteExpansionOpportunityCount: number;
  // Expansion quality: true when an economic/scaffold/town-support opportunity
  // exists on the frontier, or when an expansion objective is set.  Without
  // this, plain-tile expansion is suppressed (matches old noDirectedExpansion).
  // Note: scout is NOT included — scout-only expansion is gated separately
  // so it can be suppressed when the economy doesn't justify it.
  hasActionableNonWasteExpand: boolean;
  hasExpansionObjective: boolean;
  // True when frontierOpportunityScout > 0 but no economic/scaffold/townSupport
  // expand exists — the AI has scout-only expansion available.  Scout-only is
  // gated at the veto level (EXPAND is still available) but penalised when the
  // economy is weak so that WAIT wins instead (matches old wait_and_recover).
  hasOnlyScoutExpand: boolean;
  hasWeakEnemyBorder: boolean;
  hasBarbTarget: boolean;
  // Authoritative "can this class actually produce a command" gates — derived
  // directly from the same concrete candidate fields executeClass() checks
  // (see utility-dispatch.ts's buildDecisionInputs). Without these, EXPAND/
  // ATTACK could score high off aggregate counts/flags (frontierNeutralCount,
  // hasExpansionObjective, frontPosture) while every concrete candidate field
  // (fa.expand, fa.directedExpand, preferredEnemyAttack, fa.barbarianAttack,
  // ...) was actually undefined — e.g. a frontier where every neutral tile is
  // classified "waste" with no fog value, so preferFogEfficientExpansion
  // refuses to select any of them. The utility policy would then pick EXPAND
  // as the winning class, executeClass would return undefined, and the
  // planner would silently fall through every other class to WAIT — while
  // still reporting a phantom nonzero EXPAND/ATTACK score. See
  // docs/agents/topics/ai-planner.md.
  hasAnyExpandCandidate: boolean;
  hasAnyAttackCandidate: boolean;
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
  // Misc — stalemate is folded into canAttack for ATTACK scoring but kept
  // for MUSTER's independent check.
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

const scoreExpand = (inp: DecisionInputs): number =>
  scoreConsiderations([
    boolVeto(inp.canExpand),
    // Authoritative gate: a concrete, executable EXPAND candidate must exist
    // (mirrors executeClass's EXPAND branch exactly). Without this, the
    // aggregate flags below can pass (e.g. an expansion objective is set, or
    // frontierNeutralCount > 0) even when every candidate tile was refused as
    // valueless waste — scoring EXPAND high with nothing to actually execute.
    boolVeto(inp.hasAnyExpandCandidate),
    // Suppress plain/waste expansion when no actionable target exists AND no
    // expansion objective is set.  Scout-only passes this gate (hasOnlyScoutExpand)
    // but gets penalised below so WAIT wins when the economy is weak.
    boolVeto(
      inp.hasActionableNonWasteExpand ||
        inp.hasExpansionObjective ||
        inp.hasOnlyScoutExpand
    ),
    // Aggregate expansion signal across all non-waste opportunity types.
    // Range 0–3: 1 tile → 0.33, 2 tiles → 0.67, ≥3 → 1.0.
    linear(inp.expansionOpportunityCount, 0, 3),
    // Under core pressure, expansion is penalised rather than vetoed so
    // that a strong economic / town-support opportunity can still edge
    // out an attack.  When pressure is absent this is 1 (identity).
    inp.pressureThreatensCore && inp.expansionOpportunityCount <= 2
      ? 1 - logistic(inp.pressureAttackScore, 100, 0.03) * 0.8
      : 1,
    // Scout-only expansion is only worthwhile when the economy can afford it.
    // Scale from mildly permissive (needsEconomy=false → ~0.60 multiplier) to
    // heavily suppressed (needsEconomy=true → ~0.20 multiplier), so WAIT wins
    // over wasteful scout expansions in the old wait_and_recover scenarios.
    inp.hasOnlyScoutExpand
      ? 1 - logistic(inp.needsEconomy ? 1 : inp.needsFood ? 0.6 : 0.1, 0.3, 6) * 0.85
      : 1,
  ]);

const scoreAttack = (inp: DecisionInputs): number =>
  // canAttack already folds stalemate + enemy-presence checks inside
  // buildDecisionInputs so we can represent ATTACK in 5 considerations
  // instead of 7 (keeping compensation parity with EXPAND).
  scoreConsiderations([
    boolVeto(inp.canAttack),
    boolVeto(inp.attackReady),
    // Authoritative gate: a concrete, executable ATTACK candidate must exist
    // (mirrors executeClass's ATTACK branch: preferredEnemyAttack or
    // fa.barbarianAttack). Without this, frontPosture === "BREAK" alone could
    // pass the veto below with zero enemy/barbarian targets on the frontier,
    // scoring ATTACK high with nothing to actually execute.
    boolVeto(inp.hasAnyAttackCandidate),
    // Defer to the MUSTER class ONLY when muster can actually engage — i.e. it
    // has a weak enemy-*player* border to advance on. MUSTER never handles
    // barbarian fronts, so a barbarian-only front with muster ready must stay
    // with ATTACK; otherwise both classes veto and the AI deadlocks into
    // wait_and_recover (ATTACK says "muster handles it", MUSTER says "not my
    // target").
    boolVeto(!(inp.musterReady && inp.hasWeakEnemyBorder)),
    // Barbarian attacks don't require BREAK posture — only player attacks do.
    boolVeto(inp.frontPosture === "BREAK" || inp.hasBarbTarget),
    // Scales with how hard the enemy is pressing.
    // Midpoint 185 means pressure below ~125 barely registers.
    logistic(inp.pressureAttackScore, 185, 0.06)
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
    // Includes frontier enemy count so that ANY enemy at the gate naturally
    // suppresses economy building, letting ATTACK win the competition.
    // 1 frontier action cuts BUILD_ECONOMY by ~67%; ≥1.5 pushes to 0.
    // Uses nonWasteExpansionOpportunityCount, NOT expansionOpportunityCount:
    // waste-only neutrals are not real "expansion available" (EXPAND itself
    // refuses them), so they must not suppress economy building either.
    1 - linear(inp.nonWasteExpansionOpportunityCount + inp.frontierEnemyCount, 0, 1.5),
    // Scales up when income is genuinely weak; midpoint 0.7 ensures
    // SETTLE/EXPAND/ATTACK (all scoring ~1.0) outrank economy builds.
    logistic(inp.needsEconomy ? 1 : inp.needsFood ? 0.6 : 0.2, 0.7, 6)
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
