// Per-unit roles layered over the shared squad choreography. The timeline
// (popup-marine-timeline.ts) stages one fight for every slot -- line up,
// advance, firefight, rout, all driven by the server's outcome -- and a
// role only bends that slot's own path and stance, as a pure function of
// the same inputs. So every unit mix and every outcome composes from one
// timeline plus one role per unit, never a sequence per combination.
//
//   charge   keeps advancing past the firing line to melee range of the
//            enemy that falls in the first exchange, and fights there in
//            melee (so that enemy visibly falls to it), until the rout
//            carries it on (winner) or back (loser).
//   support  holds the back rank, firing over the line, so a big figure
//            never stands shoulder to shoulder in the infantry's rank.
//   braced   fires from a kneel.
//   line     the base pose, unchanged.
//
// Pure math, no three.js import, unit-tested in node.
import {
  APPROACH_MS,
  CLASH_MS,
  LINEUP_MS,
  MARCH_MS,
  clamp01,
  deathKitFor,
  dyingIndicesFor,
  marineKitFor,
  stopOffsetFor,
  type BattleOverlayRenderEntry,
  type BattleOverlaySkirmishEntry,
  type MarineKit,
  type MarinePose
} from "./popup-marine-timeline.js";
import type { MarineUnitRole } from "./popup-marine-units.js";

// How far short of its victim a charging unit stops, in tile-local units:
// the walker's half-depth plus its saw arm's reach.
export const MELEE_REACH = 0.12;
// Share of the rout a losing unit takes to peel off its role spot onto the
// squad's own retreat path, rather than snapping across. A winning unit
// keeps its spot and pushes on from there.
const ROUT_PEEL_T = 0.35;

/** Where a slot is along the fight, as the weight its role offset applies
 * with: 0 waiting at the lineup, rising through the advance, 1 once engaged,
 * falling back to 0 as the rout peels it away. */
export type RoleFrame = { weight: number; engaged: boolean };

const advanceWeight = (kit: MarineKit, sinceLineupEnd: number): number => {
  const marchT = clamp01(sinceLineupEnd / MARCH_MS);
  return clamp01((marchT - kit.offset) / (0.7 - kit.offset));
};

export const battleRoleFrame = (b: BattleOverlayRenderEntry, side: 0 | 1, kit: MarineKit, nowMs: number): RoleFrame => {
  if (nowMs < b.startAt + LINEUP_MS) return { weight: 0, engaged: false };
  if (nowMs < b.clashAt) return { weight: advanceWeight(kit, nowMs - b.startAt - LINEUP_MS), engaged: false };
  const clashEndAt = b.clashAt + CLASH_MS;
  if (nowMs < clashEndAt) return { weight: 1, engaged: true };
  const winning = side === 0 ? b.attackerWon : !b.attackerWon;
  if (winning) return { weight: 1, engaged: false };
  return { weight: 1 - clamp01((nowMs - clashEndAt) / (ROUT_PEEL_T * (b.endAt - clashEndAt))), engaged: false };
};

export const skirmishRoleFrame = (b: BattleOverlaySkirmishEntry, kit: MarineKit, nowMs: number): RoleFrame => {
  const elapsed = nowMs - b.startAt;
  const approachMs = Math.max(APPROACH_MS, b.holdApproachUntilElapsed ?? 0);
  if (elapsed < LINEUP_MS) return { weight: 0, engaged: false };
  if (elapsed < approachMs) return { weight: advanceWeight(kit, elapsed - LINEUP_MS), engaged: false };
  return { weight: 1, engaged: true };
};

/** The enemy a charging unit closes on: the one that falls in the first
 * exchange (each side's first-cycle casualty, which a resolved battle
 * carries over from its skirmish), so the kill lands in its reach. */
export const chargeVictimIndex = (seed: number, side: 0 | 1): number => {
  const enemy = (1 - side) as 0 | 1;
  const [first] = dyingIndicesFor((s, j) => deathKitFor(seed, s, j), enemy, true);
  return first ?? 0;
};

/** Role offset from this slot's base firing spot, in tile-local X/Z. */
const roleOffset = (
  role: MarineUnitRole,
  seed: number,
  side: 0 | 1,
  kit: MarineKit,
  perpX: number,
  perpZ: number,
  fwdX: number,
  fwdZ: number
): { x: number; z: number } => {
  if (role === "support") {
    // From its own depth back to the deepest a squad member ever holds.
    const back = stopOffsetFor({ ...kit, stopDepth: 1 }) - stopOffsetFor(kit);
    return { x: -fwdX * back, z: -fwdZ * back };
  }
  if (role !== "charge") return { x: 0, z: 0 };
  const victim = marineKitFor(seed, (1 - side) as 0 | 1, chargeVictimIndex(seed, side));
  // The victim's firing spot, in this side's frame: same perpendicular axis,
  // its forward axis is ours reversed.
  const lateral = victim.perpPos - kit.perpPos;
  const depth = stopOffsetFor(victim) - MELEE_REACH + stopOffsetFor(kit);
  return { x: perpX * lateral + fwdX * depth, z: perpZ * lateral + fwdZ * depth };
};

export type RoledPose = {
  pose: MarinePose;
  /** False while a unit is in melee: it trades blows, not bolts. */
  firesBolts: boolean;
};

export const applyUnitRole = (
  role: MarineUnitRole,
  base: MarinePose,
  frame: RoleFrame,
  seed: number,
  side: 0 | 1,
  i: number,
  perpX: number,
  perpZ: number,
  fwdX: number,
  fwdZ: number
): RoledPose => {
  if (role === "line" || base.scale <= 0) return { pose: base, firesBolts: true };
  const kit = marineKitFor(seed, side, i);
  const offset = roleOffset(role, seed, side, kit, perpX, perpZ, fwdX, fwdZ);
  // A unit only ever falls once engaged, and lies where it fell.
  const weight = base.fallT > 0 ? 1 : frame.weight;
  const pose: MarinePose = {
    ...base,
    localX: base.localX + offset.x * weight,
    localZ: base.localZ + offset.z * weight
  };
  const holding = base.stance === "stand" || base.stance === "kneel";
  if (role === "braced" && holding) pose.stance = "kneel";
  if (role === "support" && holding) pose.stance = "stand";
  if (role === "charge" && frame.engaged && base.fallT <= 0) {
    pose.stance = "melee";
    pose.flash = 0;
    return { pose, firesBolts: false };
  }
  return { pose, firesBolts: true };
};
