// Pre-resolution formation and firefight, extracted from the resolved timeline.
import type { GarrisonStart } from "./popup-marine-garrison.js";
import { choreographyApproachMs, choreographExchange, choreographyMarineKitFor } from "./popup-marine-choreography.js";
import { skirmishDeathAt, scriptedSkirmishFlash, skirmishClashAt } from "./popup-marine-full-casualties.js";
import {
   CLASH_MS, DEATH_FALL_MS, LINEUP_MS, MARCH_MS, clamp01,
  hiddenMarinePose, muzzleFlashIntensity, stopOffsetFor,
  type BattleOverlaySkirmishEntry, type MarinePose, type MarineStance
} from "./popup-marine-timeline.js";
const facingYaw = (x: number, z: number): number => Math.atan2(x, z);

/** Same pose math as computeBattlePose but for the indefinite pre-resolution
 * skirmish loop — one-time cover/advance, then a looping firefight with no
 * rout phase. Shares the exact cover/advance formulas (via the same
 * kit-derived offsets) so a resolved battle picking up from this skirmish's
 * startAt never pops. */
const computeSkirmishPoseBase = (
  b: BattleOverlaySkirmishEntry,
  side: 0 | 1,
  i: number,
  nowMs: number,
  entryLocalX: number,
  entryLocalZ: number,
  perpX: number,
  perpZ: number,
  fwdX: number,
  fwdZ: number,
  // See computeBattlePose's own siegeVictimIndex/garrisonStart.
  siegeVictimIndex?: number,
  garrisonStart?: GarrisonStart
): MarinePose => {
  const kit = choreographyMarineKitFor(b, side, i);
  const yaw = facingYaw(fwdX, fwdZ);
  const elapsed = nowMs - b.startAt;
  // Normally the firefight starts exactly APPROACH_MS after this skirmish
  // was first seen — but a DEFENDER's skirmish holds that plateau open past
  // APPROACH_MS until the attacker's real (mechanical) transit delay
  // elapses, so the fight doesn't start visually before the attacker's
  // troops have actually arrived. See BattleOverlaySkirmishEntry's comment.
  const approachMs = Math.max(choreographyApproachMs(b), b.holdApproachUntilElapsed ?? 0);
  const lineupMs = b.choreography ? 200 : LINEUP_MS;
  const marchMs = b.choreography ? choreographyApproachMs(b) - lineupMs : MARCH_MS;
  const deathAt = skirmishDeathAt(b, side, i, siegeVictimIndex);

  // See computeBattlePose: the advance starts from this waiting slot, not
  // from the bare entry point.
  if (garrisonStart?.absent) return hiddenMarinePose(yaw);
  const lineupX = garrisonStart ? garrisonStart.localX : entryLocalX + perpX * kit.perpPos;
  const lineupZ = garrisonStart ? garrisonStart.localZ : entryLocalZ + perpZ * kit.perpPos;

  if (elapsed < lineupMs) {
    const t = clamp01(elapsed / lineupMs);
    // A garrison is already standing there -- no pop-in.
    const scale = garrisonStart ? 1 : clamp01((t - kit.offset * 0.6) / 0.25);
    return {
      // Holding at the entry point, not advancing: a run clip here reads as
      // running on the spot, so wait in the firing stance instead.
      stance: garrisonStart ? garrisonStart.stance : kit.kneels ? "kneel" : "stand",
      // Dead still. This used to add a per-marine sine "sway" to the
      // formation slot; because the battle camera looks at the tile
      // obliquely, sideways drift read on screen as the whole squad
      // hovering up and down before the fight started. A marine waiting to
      // advance holds its stance and its position.
      localX: lineupX,
      localZ: lineupZ,
      yaw, scale, crouchT: 1, fallT: 0, flash: 0
    };
  }

  const firingX = perpX * kit.perpPos - fwdX * stopOffsetFor(kit);
  const firingZ = perpZ * kit.perpPos - fwdZ * stopOffsetFor(kit);
  const firingStance: MarineStance = kit.kneels ? "kneel" : "stand";

  if (elapsed < approachMs) {
    const marchT = clamp01((elapsed - lineupMs) / marchMs);
    const localT = clamp01((marchT - kit.offset) / (0.7 - kit.offset));
    // Only play the run clip while the marine is actually translating.
    // localT sits at 0 through this marine's staggered start delay and at 1
    // after it halts; running in place at either end looks broken. Once
    // localT reaches 1 the marine holds at the firing line for the rest of
    // approachMs (which, for a defender's held plateau, can run well past
    // the normal march duration above) rather than continuing to "march".
    const moving = localT > 0 && localT < 1;
    return {
      stance: moving ? "run" : firingStance,
      localX: lineupX * (1 - localT) + firingX * localT,
      localZ: lineupZ * (1 - localT) + firingZ * localT,
      yaw, scale: 1, crouchT: 1, fallT: 0, flash: 0
    };
  }

  const cycleT = clamp01(((elapsed - approachMs) % CLASH_MS) / CLASH_MS);
  const flash = scriptedSkirmishFlash(b, side, i, nowMs) ?? muzzleFlashIntensity(kit, cycleT);
  if (nowMs >= deathAt) {
    const fallT = clamp01((nowMs - deathAt) / DEATH_FALL_MS);
    return { stance: firingStance, localX: firingX, localZ: firingZ, yaw, scale: 1, crouchT: 1 - fallT, fallT, flash: 0 };
  }


  return { stance: firingStance, localX: firingX, localZ: firingZ, yaw, scale: 1, crouchT: 1, fallT: 0, flash };
};

export const computeSkirmishPose = (...args: Parameters<typeof computeSkirmishPoseBase>): MarinePose => {
  const [b, side, i, nowMs, entryLocalX, entryLocalZ, perpX, perpZ, fwdX, fwdZ, siegeVictimIndex] = args;
  const pose = computeSkirmishPoseBase(...args);
  if (!b.choreography || pose.scale <= 0) return pose;
  const axes = { entryLocalX, entryLocalZ, perpX, perpZ, fwdX, fwdZ };
  const clashAt = skirmishClashAt(b);
  if (nowMs < clashAt) return pose;
  const deathAt = skirmishDeathAt(b, side, i, siegeVictimIndex);
  return choreographExchange(pose, b, side, i, nowMs, axes, { startAt: clashAt, deathAt });
};
