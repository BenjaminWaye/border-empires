// Laser-bolt flight and impact-spark math for the pop-up-marine battle
// overlay. Split out of popup-marine-timeline.ts (which was near the repo's
// 500-line cap) so the shot lifecycle — muzzle -> flight -> impact spark —
// lives in one place.
//
// Like every other part of this system, NOTHING here is a spawned particle
// with its own lifetime: a bolt and its impact sparks are PURE FUNCTIONS of
// the current firefight time. Scrubbing the battle timeline
// (FullAttackLifecycle) or a player rejoining a siege mid-fight therefore
// reproduces exactly the same shots and the same sparks in exactly the same
// places, instead of replaying a stateful emitter that would depend on when
// you happened to start watching.
//
// Each of a marine's three fireAt pulses drives the whole chain: the muzzle
// flash (muzzleFlashIntensity), then a bolt crossing for BOLT_TRAVEL_T, then
// a spark burst at the target for SPARK_LINGER_T.
import {
  APPROACH_MS,
  CLASH_MS,
  MARINES_PER_SIDE,
  clamp01,
  hash01,
  marineKitFor
} from "./popup-marine-timeline.js";
import type {
  BattleOverlayRenderEntry,
  BattleOverlaySkirmishEntry,
  MarineKit
} from "./popup-marine-timeline.js";

/** Fraction of the firefight window a bolt spends crossing to its target. */
export const BOLT_TRAVEL_T = 0.1;

/** How long the impact sparks linger after a bolt lands, in the same units. */
export const SPARK_LINGER_T = 0.045;

/** Spark shards drawn per impact. Kept small: at the marines' on-screen size
 * a burst reads as a bright speck-cluster, and every shard is an instance in
 * the shared spark InstancedMesh. */
export const SPARKS_PER_IMPACT = 5;

export type LaserBolt = {
  /** 0 = just left the muzzle, 1 = arriving at the target. */
  progress: number;
  /** Which marine index on the OPPOSING side this bolt is aimed at. */
  targetIndex: number;
};

export type LaserImpact = {
  /** Which marine index on the OPPOSING side was hit. */
  targetIndex: number;
  /** 0 = the instant of impact, 1 = the sparks have finished fading. */
  age: number;
};

/** The opposing-side marine a given fire pulse is aimed at. Stable per
 * (marine, pulse) so a bolt tracks one line the whole way across rather than
 * re-aiming every frame — and so its impact sparks land where it pointed. */
const targetIndexFor = (seed: number, side: 0 | 1, i: number, pulse: number): number =>
  Math.min(MARINES_PER_SIDE - 1, Math.floor(hash01(seed * 31 + i, side, 50 + pulse) * MARINES_PER_SIDE));

const boltsForKit = (kit: MarineKit, seed: number, side: 0 | 1, i: number, firefightT: number): LaserBolt[] => {
  const bolts: LaserBolt[] = [];
  for (let pulse = 0; pulse < kit.fireAt.length; pulse++) {
    const elapsed = firefightT - kit.fireAt[pulse]!;
    if (elapsed < 0 || elapsed > BOLT_TRAVEL_T) continue;
    bolts.push({ progress: elapsed / BOLT_TRAVEL_T, targetIndex: targetIndexFor(seed, side, i, pulse) });
  }
  return bolts;
};

const impactsForKit = (kit: MarineKit, seed: number, side: 0 | 1, i: number, firefightT: number): LaserImpact[] => {
  const impacts: LaserImpact[] = [];
  for (let pulse = 0; pulse < kit.fireAt.length; pulse++) {
    // The spark window begins exactly where the bolt window ends, so the
    // streak never disappears a frame before its sparks appear.
    const sinceHit = firefightT - kit.fireAt[pulse]! - BOLT_TRAVEL_T;
    if (sinceHit < 0 || sinceHit > SPARK_LINGER_T) continue;
    impacts.push({ targetIndex: targetIndexFor(seed, side, i, pulse), age: sinceHit / SPARK_LINGER_T });
  }
  return impacts;
};

/** Where one spark shard of an impact sits, as an offset from the hit point
 * in units of the burst's full radius, plus how bright it still is.
 * Deterministic in (seed, side, shooter, target, shard). */
export const sparkShard = (
  seed: number,
  side: 0 | 1,
  shooter: number,
  impact: LaserImpact,
  shard: number
): { x: number; y: number; z: number; brightness: number } => {
  const salt = 900 + shard * 7 + impact.targetIndex * 31;
  // Spray biased back toward the shooter and upward, the way a real hit
  // throws debris back off the surface rather than spherically.
  const theta = hash01(seed + shooter, side, salt) * Math.PI * 2;
  const lift = 0.25 + hash01(seed + shooter, side, salt + 1) * 0.75;
  const speed = 0.55 + hash01(seed + shooter, side, salt + 2) * 0.45;
  // Shards decelerate as they fade, so the burst blooms fast then settles.
  const spread = speed * (1 - (1 - impact.age) * (1 - impact.age));
  return {
    x: Math.cos(theta) * spread,
    y: lift * spread,
    z: Math.sin(theta) * spread,
    brightness: 1 - impact.age
  };
};

/** Bolts in flight for one marine of a resolved battle at `nowMs`. */
export const computeBattleBolts = (b: BattleOverlayRenderEntry, side: 0 | 1, i: number, nowMs: number): LaserBolt[] => {
  if (nowMs < b.clashAt || nowMs >= b.clashAt + CLASH_MS) return [];
  const t = clamp01((nowMs - b.clashAt) / CLASH_MS);
  return boltsForKit(marineKitFor(b.hashSeed, side, i), b.hashSeed, side, i, t);
};

/** Impact spark bursts for one marine's shots of a resolved battle. */
export const computeBattleImpacts = (
  b: BattleOverlayRenderEntry,
  side: 0 | 1,
  i: number,
  nowMs: number
): LaserImpact[] => {
  if (nowMs < b.clashAt || nowMs >= b.clashAt + CLASH_MS) return [];
  const t = clamp01((nowMs - b.clashAt) / CLASH_MS);
  return impactsForKit(marineKitFor(b.hashSeed, side, i), b.hashSeed, side, i, t);
};

const skirmishCycleT = (b: BattleOverlaySkirmishEntry, nowMs: number): number | undefined => {
  // Mirrors computeSkirmishPose's approachMs override: a defender's held
  // approach plateau (see BattleOverlaySkirmishEntry.holdApproachUntilElapsed)
  // must delay the first shot exactly as long as it delays the firefight
  // itself, or bolts would start crossing before the marines visually stop
  // marching and raise their weapons.
  const approachMs = Math.max(APPROACH_MS, b.holdApproachUntilElapsed ?? 0);
  const elapsed = nowMs - b.startAt;
  if (elapsed < approachMs) return undefined;
  return clamp01(((elapsed - approachMs) % CLASH_MS) / CLASH_MS);
};

/** Bolts in flight for one marine of the pre-resolution skirmish loop. */
export const computeSkirmishBolts = (
  b: BattleOverlaySkirmishEntry,
  side: 0 | 1,
  i: number,
  nowMs: number
): LaserBolt[] => {
  const cycleT = skirmishCycleT(b, nowMs);
  if (cycleT === undefined) return [];
  return boltsForKit(marineKitFor(b.hashSeed, side, i), b.hashSeed, side, i, cycleT);
};

/** Impact spark bursts for one marine's shots of the skirmish loop. */
export const computeSkirmishImpacts = (
  b: BattleOverlaySkirmishEntry,
  side: 0 | 1,
  i: number,
  nowMs: number
): LaserImpact[] => {
  const cycleT = skirmishCycleT(b, nowMs);
  if (cycleT === undefined) return [];
  return impactsForKit(marineKitFor(b.hashSeed, side, i), b.hashSeed, side, i, cycleT);
};
