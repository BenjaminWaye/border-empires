// Shared timeline for the slow, deliberate "your AFC lands from orbit" join
// animation (docs/manifest-afc-module-delivery-animation-plan.md, "Join drop").
// One set of constants read by the state machine, the true-3D FX layer and
// the 2D companion, so the two renderers can never drift apart in pacing.

/** The map must have been continuously unobstructed for this long before the drop starts (absorbs modal fade-out; nothing animates during it). */
export const AFC_JOIN_DROP_DWELL_MS = 1200;
// The beats below are pinned to the 9 s rocket clip played as the drop starts
// (/audio/afc-drop-rocket.mp3): a bright full-power roar, a long wind-down as
// its pitch falls, a short lull when the engines cut, then a sharp impact at
// 7.15 s followed by a low ground rumble.
/** Thrusters at full burn from the moment the drop starts (the clip's bright opening roar). */
export const AFC_JOIN_FULL_BURN_MS = 1700;
/** The thrust winds down from full burn until the engines cut here (the clip's falling pitch, then its lull). */
export const AFC_JOIN_ENGINE_CUT_MS = 6350;
/** Start of the drop to touchdown, on the clip's impact hit. After the engine cut the AFC drops the last stretch unpowered. */
export const AFC_JOIN_DESCENT_MS = 7150;
/** Touchdown to the end of the smoke/power-on afterglow (the clip's ground rumble, then the smoke settling). */
export const AFC_JOIN_AFTERGLOW_MS = 2850;
export const AFC_JOIN_TOTAL_MS = AFC_JOIN_DESCENT_MS + AFC_JOIN_AFTERGLOW_MS;
/** Fraction of the fall completed when the engines cut: the AFC has braked to a near-hover just above the ground. */
const ENGINE_CUT_FALLEN = 0.95;
/** Re-entry streak fade-in, so the AFC is seen coming. */
const STREAK_FADE_IN_MS = 500;
/** The streak burns off over this long once the thrust starts winding down. */
const STREAK_FADE_OUT_MS = 1500;
/** The descending copy stays this long past touchdown so the real AFC can take over under the smoke. */
export const AFC_JOIN_MODEL_OVERLAP_MS = 800;
/** Only an AFC activated this recently counts as a join; a returning player's old AFC never replays. */
export const AFC_JOIN_MAX_AGE_MS = 30 * 60_000;
/** Safety net: if some overlay stays "open" this long the AFC is revealed without the animation, so it can never stay hidden. */
export const AFC_JOIN_FALLBACK_REVEAL_MS = 5 * 60_000;

/** Fraction of the fall completed after `ageMs` (0 = in orbit, 1 = landed). The thrusters brake the AFC from orbital speed to a standstill just above the ground at the engine cut, then it drops the last stretch and hits the ground with a thud. */
export const afcJoinFallenFraction = (ageMs: number): number => {
  if (ageMs <= 0) return 0;
  if (ageMs >= AFC_JOIN_DESCENT_MS) return 1;
  if (ageMs < AFC_JOIN_ENGINE_CUT_MS) {
    const s = ageMs / AFC_JOIN_ENGINE_CUT_MS;
    return ENGINE_CUT_FALLEN * (1 - (1 - s) * (1 - s));
  }
  const u = (ageMs - AFC_JOIN_ENGINE_CUT_MS) / (AFC_JOIN_DESCENT_MS - AFC_JOIN_ENGINE_CUT_MS);
  return ENGINE_CUT_FALLEN + (1 - ENGINE_CUT_FALLEN) * u * u;
};

/** 0..1 thruster strength: ignites at the start, holds at full burn, winds down to a low idle, then cuts out. */
export const afcJoinBrakeIntensity = (ageMs: number): number => {
  if (ageMs < 0 || ageMs >= AFC_JOIN_ENGINE_CUT_MS) return 0;
  const ignite = Math.min(1, ageMs / 200);
  if (ageMs < AFC_JOIN_FULL_BURN_MS) return ignite;
  const windDown = (ageMs - AFC_JOIN_FULL_BURN_MS) / (AFC_JOIN_ENGINE_CUT_MS - AFC_JOIN_FULL_BURN_MS);
  // Sputter out over the last 120 ms rather than snapping off.
  const cutoff = Math.min(1, (AFC_JOIN_ENGINE_CUT_MS - ageMs) / 120);
  return (1 - 0.65 * windDown) * cutoff;
};

/** 0..1 re-entry streak above the hull: fades in so the AFC is seen coming, and burns off once the thrust starts winding down. Shared by both renderers. */
export const afcJoinStreakAlpha = (ageMs: number): number => {
  const fadeIn = Math.max(0, Math.min(1, ageMs / STREAK_FADE_IN_MS));
  const fadeOut = Math.max(0, Math.min(1, (ageMs - AFC_JOIN_FULL_BURN_MS) / STREAK_FADE_OUT_MS));
  return fadeIn * (1 - fadeOut);
};
