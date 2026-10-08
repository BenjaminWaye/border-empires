// Shared timeline for the slow, deliberate "your AFC lands from orbit" join
// animation (docs/manifest-afc-module-delivery-animation-plan.md, "Join drop").
// One set of constants read by the state machine, the true-3D FX layer and
// the 2D companion, so the two renderers can never drift apart in pacing.

/** The map must have been continuously unobstructed for this long before the drop starts (absorbs modal fade-out; nothing animates during it). */
export const AFC_JOIN_DROP_DWELL_MS = 1200;
/** Re-entry: the AFC falls from orbit, accelerating through the atmosphere. */
export const AFC_JOIN_REENTRY_MS = 3000;
/** Braking burn: the last, slowest part of the descent, ending at zero velocity. */
export const AFC_JOIN_BRAKE_MS = 2000;
/** Start of the drop to touchdown. */
export const AFC_JOIN_DESCENT_MS = AFC_JOIN_REENTRY_MS + AFC_JOIN_BRAKE_MS;
/** Touchdown to the end of the smoke/power-on afterglow. The whole drop runs 9 s, matching the rocket sound played at its start. */
export const AFC_JOIN_AFTERGLOW_MS = 4000;
export const AFC_JOIN_TOTAL_MS = AFC_JOIN_DESCENT_MS + AFC_JOIN_AFTERGLOW_MS;
/** The descending copy stays this long past touchdown so the real AFC can take over under the smoke. */
export const AFC_JOIN_MODEL_OVERLAP_MS = 800;
/** Only an AFC activated this recently counts as a join; a returning player's old AFC never replays. */
export const AFC_JOIN_MAX_AGE_MS = 30 * 60_000;
/** Safety net: if some overlay stays "open" this long the AFC is revealed without the animation, so it can never stay hidden. */
export const AFC_JOIN_FALLBACK_REVEAL_MS = 5 * 60_000;

/** Fraction of the fall completed after `ageMs` (0 = in orbit, 1 = landed). Velocity is continuous at the re-entry/braking seam and reaches zero at touchdown. */
export const afcJoinFallenFraction = (ageMs: number): number => {
  if (ageMs <= 0) return 0;
  if (ageMs >= AFC_JOIN_DESCENT_MS) return 1;
  // The seam sits where the two quadratic segments have equal speed.
  const seam = AFC_JOIN_REENTRY_MS / AFC_JOIN_DESCENT_MS;
  if (ageMs < AFC_JOIN_REENTRY_MS) {
    const s = ageMs / AFC_JOIN_REENTRY_MS;
    return seam * s * s;
  }
  const u = (ageMs - AFC_JOIN_REENTRY_MS) / AFC_JOIN_BRAKE_MS;
  return seam + (1 - seam) * (1 - (1 - u) * (1 - u));
};

/** 0..1 thruster strength: lights just before braking starts, then tapers as the AFC slows. */
export const afcJoinBrakeIntensity = (ageMs: number): number => {
  const rampStart = AFC_JOIN_REENTRY_MS - 150;
  if (ageMs < rampStart || ageMs >= AFC_JOIN_DESCENT_MS) return 0;
  const ramp = Math.min(1, (ageMs - rampStart) / 300);
  const taper = 1 - 0.8 * Math.max(0, (ageMs - AFC_JOIN_REENTRY_MS) / AFC_JOIN_BRAKE_MS);
  return ramp * taper;
};
