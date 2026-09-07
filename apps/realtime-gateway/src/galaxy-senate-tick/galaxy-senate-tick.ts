import type { GalaxySenateProposalType } from "../galaxy-senate-store/galaxy-senate-store.js";
import { GALAXY_CYCLE_LENGTH_MS, EMBARGO_TRICKLE_MULTIPLIER } from "../galaxy-cycle-tick/galaxy-cycle-tick.js";

// Re-exported so a caller only needs this module for everything
// Senate-shaped; the constant's canonical home is galaxy-cycle-tick.ts
// since that's the module that actually applies it (avoids a circular
// import between the two).
export { EMBARGO_TRICKLE_MULTIPLIER };

// Galactic meta-layer v1 (docs/galactic-campaign-design.md §4/§13): pure
// Senate logic — Dominion vote weight, proposal cost/quorum/cooldown
// constants, and the resolve-a-proposal decision. Kept side-effect-free and
// dependency-free, matching galaxy-cycle-tick.ts's split (the scheduler
// wiring around this is the thin shim).

// JUDGMENT CALL: the Senate needs one shared, galaxy-wide Cycle clock for
// "resolves at the next Cycle tick" -- but the existing economy engine
// (galaxy-cycle-scheduler.ts) deliberately has no such thing: each empire's
// Cycle boundary is anchored to whenever their own ledger row was first
// created, so different empires can be on completely different offsets.
// That's fine for a per-empire trickle/upkeep tick, but ill-defined for a
// vote every participant needs to resolve at the same moment. Rather than
// introduce a new stored "galaxy clock" record, the global Cycle index is
// derived purely from wall-clock time against the same GALAXY_CYCLE_LENGTH_MS
// grid already used for the economy Cycle (weekly) -- deterministic, and
// nothing new to persist or get out of sync.
export const currentGlobalCycleIndex = (nowMs: number): number => Math.floor(nowMs / GALAXY_CYCLE_LENGTH_MS);

export type GalaxySenateActionConfig = {
  influenceCost: number;
  quorumPct: number;
  cooldownCycles: number;
  // Only Sanctions (EMBARGO) have a standing duration once passed; CONTEST's
  // effect is instantaneous (forces the target territory's Stability to 0).
  durationCycles?: number;
};

// §13's Senate table, restricted to the two actions this pass implements —
// see galaxy-senate-store.ts's top comment for why the rest are deferred.
export const GALAXY_SENATE_ACTIONS: Record<GalaxySenateProposalType, GalaxySenateActionConfig> = {
  EMBARGO: { influenceCost: 15, quorumPct: 0.25, cooldownCycles: 1, durationCycles: 2 },
  CONTEST: { influenceCost: 40, quorumPct: 0.4, cooldownCycles: 2 }
};

// §4: "carries votes from at least 3 distinct voting entities", applied to
// every quorum regardless of action type.
export const MIN_DISTINCT_VOTERS = 3;

// §13/§19.7 Dominion Score, restricted to the terms this pass can actually
// compute: developments and Wonders don't exist yet (both v2+), so they
// contribute 0 rather than being omitted from the formula entirely --
// leaving the formula shape intact means no rework once those systems land.
export type DominionVoteWeightInput = {
  planets: number;
  outposts: number;
  developments?: number;
  wonders?: number;
  // Sum of Stability across every territory this empire holds, not an
  // average -- matching the doc's worked comparison in §13.
  totalStability: number;
};

export const computeDominionVoteWeight = (input: DominionVoteWeightInput): number =>
  input.planets * 10 + input.outposts * 3 + (input.developments ?? 0) * 2 + (input.wonders ?? 0) * 15 + input.totalStability / 100;

export type SenateVoteTally = { voterAuthUid: string; weight: number };

export type SenateResolutionResult = {
  status: "PASSED" | "FAILED";
  supportWeight: number;
  distinctVoters: number;
};

// §4: a proposal passes if its supporting weight clears the action's quorum
// percentage of *total galaxy voting weight* AND it carries at least
// MIN_DISTINCT_VOTERS distinct voters. Zero total galaxy weight (e.g. no
// territory-holding empires at all) can never pass -- there's nothing to
// clear a percentage of.
export const resolveSenateProposal = (
  type: GalaxySenateProposalType,
  votes: ReadonlyArray<SenateVoteTally>,
  totalGalaxyWeight: number
): SenateResolutionResult => {
  const distinctVoters = new Set(votes.map((v) => v.voterAuthUid)).size;
  const supportWeight = votes.reduce((sum, v) => sum + v.weight, 0);
  const quorumPct = GALAXY_SENATE_ACTIONS[type].quorumPct;
  const clearsQuorum = totalGalaxyWeight > 0 && supportWeight / totalGalaxyWeight >= quorumPct;
  const passed = clearsQuorum && distinctVoters >= MIN_DISTINCT_VOTERS;
  return { status: passed ? "PASSED" : "FAILED", supportWeight, distinctVoters };
};

// §13's "cooldown per target": true if `type` cannot yet be raised again
// against `target` as of `currentCycleIndex`, given the Cycle index the
// target's most recently resolved proposal of that same type resolved in
// (undefined = never targeted before, so never on cooldown).
export const isTargetOnCooldown = (
  type: GalaxySenateProposalType,
  latestResolvedAtCycleIndex: number | undefined,
  currentCycleIndex: number
): boolean => {
  if (latestResolvedAtCycleIndex === undefined) return false;
  const cooldownUntil = latestResolvedAtCycleIndex + GALAXY_SENATE_ACTIONS[type].cooldownCycles;
  return currentCycleIndex < cooldownUntil;
};
