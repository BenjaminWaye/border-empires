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
  "BUILD_BEACON",
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
  // Fixed-borders-via-reach plan: best RELAY_BEACON site available
  // (chooseBestRelayBeaconBuild already requires it to newly cover some
  // unowned land, so its mere existence is the whole precondition — see
  // scoreBuildBeacon).
  hasRelayBeaconBuild: boolean;
  // Magnitude of what that site actually unlocks (chooseBestRelayBeaconBuild's
  // RelayBeaconBuildPlan.siteValue) — 0 when hasRelayBeaconBuild is false.
  // Feeds scoreBuildBeacon's graduated consideration: existence alone doesn't
  // distinguish a beacon reaching one empty tile from one reaching several
  // towns/resources/docks, and it should.
  relayBeaconSiteValue: number;
  // True on the boosted portion of this player's beacon build cadence (4
  // consecutive completed builds boosted, then 1 unboosted, repeating — see
  // ai-beacon-cadence.ts and docs/ai-structure-building-rewrite-plan.md's
  // §16). Feeds a flat additive bonus in scoreBuildBeacon on top of the
  // graduated site-value consideration — still fully vetoable, never
  // overrides a missing site/dev-slot/frontier-enemy gate.
  beaconBoostActive: boolean;
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
    // Suppress plain/waste expansion when no real (economic/townSupport/
    // scaffold) opportunity exists AND no expansion objective is set.
    // hasOnlyScoutExpand is deliberately NOT included here (it used to be):
    // scoutScore clears its own >=30 threshold almost automatically for any
    // tile at the edge of explored territory (novelFrontierCount alone is
    // worth 70 in scoutExpandScore — frontier-scoring.ts), so treating
    // "reveals some fog" as good enough to unlock EXPAND meant the AI
    // claimed close to its entire reach circle regardless of value (observed
    // live: 92-96% of reachable land owned, vs. the ~1-in-20 tiles that
    // actually carry a resource/town/dock/wonder on this map). EXPAND now
    // requires a genuine prize nearby, or an active expansion objective —
    // fog-revealing land alone no longer counts as "worth claiming". Scout
    // classification itself (hasOnlyScoutExpand, frontierOpportunityScout)
    // is untouched elsewhere; it still feeds chooseBestRelayBeaconBuild's
    // "maximize newly revealed land" scoring, just no longer lets EXPAND
    // claim that land directly.
    boolVeto(inp.hasActionableNonWasteExpand || inp.hasExpansionObjective),
    // Aggregate expansion signal across all non-waste opportunity types.
    // Range 0–3: 1 tile → 0.33, 2 tiles → 0.67, ≥3 → 1.0.
    linear(inp.expansionOpportunityCount, 0, 3),
    // Under core pressure, expansion is penalised rather than vetoed so
    // that a strong economic / town-support opportunity can still edge
    // out an attack.  When pressure is absent this is 1 (identity).
    inp.pressureThreatensCore && inp.expansionOpportunityCount <= 2
      ? 1 - logistic(inp.pressureAttackScore, 100, 0.03) * 0.8
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
    // Suppressed by an enemy at the gate — fight first, let ATTACK/MUSTER win
    // the competition. 1.5+ frontier enemies pushes this to 0.
    //
    // Deliberately NOT suppressed by expansion opportunity anymore (it used
    // to be, via nonWasteExpansionOpportunityCount — see git history). That
    // made sense pre-reach, when EXPAND was uncapped and cheap enough (10 MP
    // vs 80+) that grabbing land first was always the better trade. Under the
    // fixed-borders-via-reach plan, EXPAND is capped by reach and doesn't
    // touch a dev slot at all, so it isn't actually competing with a build for
    // the same resource — a fresh RELAY_BEACON typically opens a whole
    // radius-5 area, which drove this term to ~0 for the entire post-beacon
    // expansion window, exactly when a free dev slot (the beacon's own) and a
    // real chance to interleave an economic build exist. See
    // docs/ai-structure-building-rewrite-plan.md's reach-consideration section.
    1 - linear(inp.frontierEnemyCount, 0, 1.5),
    logistic(inp.needsEconomy ? 1 : inp.needsFood ? 0.6 : 0.2, 0.7, 6)
  ]);

// A relay beacon (fixed-borders-via-reach plan) is border/reach
// infrastructure, not an economic structure — it doesn't produce
// gold/resources itself and shouldn't inherit BUILD_ECONOMY's
// economy-weakness/expansion-availability suppression terms. Kept as its
// own decision class so it competes on its own terms and is easy to reason
// about/measure independently (sim_ai_command_total by structure type, not
// folded into a generic BUILD_ECONOMIC_STRUCTURE bucket).
//
// Four plain conditions instead of a bundled precondition function (the
// earlier version gated on a helper, isReachStarved, that combined five
// unrelated checks behind one name — hard to reason about from the
// outside): a build slot is free, there's no enemy at the gate right now
// (fight first — building undefended infrastructure mid-attack is the
// wrong call, let ATTACK/MUSTER win instead), EXPAND doesn't already have a
// real prize to claim (a beacon reaches further ground — no reason to build
// one while there's still an already-in-reach town/resource/dock sitting
// unclaimed; claim that first, plain EXPAND already handles it), and a
// graduated read of how much the best available site is actually worth.
//
// That last term used to be a plain boolVeto(hasRelayBeaconBuild) — "a site
// exists" — which scored a beacon reaching one empty tile identically to one
// reaching three towns and a dock (both hit 1.0 once unvetoed). Linear on
// relayBeaconSiteValue fixes that: RELAY_BEACON_SITE_VALUE_FLOOR is 1 (the
// smallest value chooseBestRelayBeaconBuild's own newCoverage.score>0 veto
// ever lets through — a single plain LAND tile), so a beacon whose only
// prize is one empty tile scores ~0 here regardless of the other terms;
// RELAY_BEACON_SITE_VALUE_CEILING is roughly 3 valuable tiles' worth
// (estimateNewReachCoverage's VALUABLE_TARGET_COVERAGE_WEIGHT is 8 per
// town/resource/dock/wonder — relay-beacon-command-planner.ts), a site clearly
// worth the manpower and dev slot regardless of anything else. First-pass
// constants, expect tuning against real games.
//
// This also gives the AI's build cadence a natural taper without any counter
// or cooldown: as beacons claim the richest nearby sites first, each
// successive candidate's siteValue tends to fall, so this term — and BUILD_BEACON's
// score with it — decays on its own as reach approaches saturation, instead
// of needing an artificial "every N beacons" rule.
const RELAY_BEACON_SITE_VALUE_FLOOR = 1;
const RELAY_BEACON_SITE_VALUE_CEILING = 24;

// Confirmed cadence design (docs/ai-structure-building-rewrite-plan.md §16,
// ai-beacon-cadence.ts): for 4 consecutive completed builds, BUILD_BEACON
// gets this flat bonus on top of its normal graduated score, so a legal
// beacon reliably outcompetes BUILD_ECONOMY/BUILD_DEFENSE during that
// window; the 5th build in the cycle gets none, letting the plain
// need-driven comparison decide. A strong bias, not a hard override — the
// boost is added AFTER the vetoes/graduated term below, so it can never
// revive a build that's still illegal (no site, no dev slot, enemy at the
// gate, or a real in-reach EXPAND prize still unclaimed).
const BEACON_CADENCE_BOOST = 0.6;

const scoreBuildBeacon = (inp: DecisionInputs): number => {
  const base = scoreConsiderations([
    boolVeto(inp.hasRelayBeaconBuild),
    boolVeto(inp.devSlotAvailable),
    boolVeto(inp.frontierEnemyCount === 0),
    boolVeto(!inp.hasActionableNonWasteExpand),
    linear(inp.relayBeaconSiteValue, RELAY_BEACON_SITE_VALUE_FLOOR, RELAY_BEACON_SITE_VALUE_CEILING)
  ]);
  if (base === 0 || !inp.beaconBoostActive) return base;
  return Math.min(1, base + BEACON_CADENCE_BOOST);
};

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
  BUILD_BEACON: scoreBuildBeacon,
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
