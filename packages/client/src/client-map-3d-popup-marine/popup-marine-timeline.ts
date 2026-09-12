// Pure timing/pose math for the true-3D pop-up-marine battle overlay. No
// three.js import here on purpose: this module is exercised by plain vitest
// (node environment, no WebGL/DOM) so the pose math itself can be unit
// tested independently of the InstancedMesh plumbing in
// popup-marine-overlay-fx.ts, which is the only file that turns these
// outputs into a Matrix4.
//
// Same phase shape as the dot-swarm system it replaces (see git history for
// the dot-swarm system this replaced): cover -> advance -> firefight -> rout,
// driven entirely by server-resolved outcomes. The animation never decides
// anything — attackerWon is already known before the first frame renders;
// this module only stages the reveal. The whole fight happens on the target
// tile (the tile under attack), clamped to TILE_LOCAL_MAX same as before.
export const LINEUP_MS = 2500; // "cover" — squad rushes to position, staggered pop-in
export const MARCH_MS = 900; // "advance" — squad closes from tile edge to the firing line
export const APPROACH_MS = LINEUP_MS + MARCH_MS;
export const CLASH_MS = 1300; // "firefight" — hold aim, fire in bursts, casualties
export const ROUT_MS = 950; // winner pushes through, loser ducks and scatters
export const BATTLE_OVERLAY_TOTAL_MS = APPROACH_MS + CLASH_MS + ROUT_MS;

export const MARINES_PER_SIDE = 7; // matches the muster-transit march company size (SOLDIERS_PER_COMPANY)
export const WINNER_DEATHS = 1;
export const LOSER_DEATHS = 2;
// Fraction of CLASH_MS a falling marine takes to finish collapsing once its
// death moment (DeathKit.at) arrives.
const DEATH_FADE_T = 0.16;
// Fraction of ROUT_MS spent blending out of the firefight's standing-aim
// pose rather than snapping straight into the rout pose.
const ROUT_SETTLE_T = 0.15;

// Tile half-width (matches TILE_HALF used by unrelated systems like
// client-map-3d-fort-overlay.ts) — this is tile geometry, not marine scale,
// so it stays fixed across the model/spacing resize below: marines still
// march in from the real tile edge before converging on a small firing-line
// cluster near the tile center.
const TILE_LOCAL_MAX = 0.46;
export const clampLocal = (v: number): number => Math.max(-TILE_LOCAL_MAX, Math.min(TILE_LOCAL_MAX, v));
export const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

export function hash01(a: number, b: number, salt: number): number {
  let h = (a * 374761393) ^ (b * 668265263) ^ (salt * 15485863);
  h = ((h >> 16) ^ h) * 0x45d9f3b;
  h = ((h >> 16) ^ h) * 0x45d9f3b;
  h = (h >> 16) ^ h;
  return (h >>> 0) / 0xffffffff;
}

export type BattleOverlayRenderEntry = {
  srcWorldX: number;
  srcWorldZ: number;
  tgtWorldX: number;
  tgtWorldZ: number;
  srcSurfaceY: number;
  tgtSurfaceY: number;
  attackerColor: string;
  defenderColor: string;
  attackerWon: boolean;
  startAt: number;
  clashAt: number;
  endAt: number;
  // When true the battle continues a pre-resolution skirmish that already
  // shed WINNER_DEATHS marines per side during its first firefight cycle —
  // those marines stay collapsed rather than re-falling, and only the
  // loser's remaining deaths emerge over the battle's own firefight window.
  fromSkirmish: boolean;
  // Stable per-tile hash seed (target tile coordinates), NOT an array index
  // — must be derived the same way a preceding skirmish's hashSeed was, so a
  // resolved battle picking up from a skirmish keeps every marine's
  // offset/perp/fire-schedule identical across the transition.
  hashSeed: number;
};

// A siege still counting down — outcome unknown. Plays the same cover-
// >advance approach as a resolved battle, then indefinite firefight-
// oscillation at the tile center with muzzle flashes and first-cycle
// casualties (WINNER_DEATHS per side), but no rout phase.
export type BattleOverlaySkirmishEntry = {
  srcWorldX: number;
  srcWorldZ: number;
  tgtWorldX: number;
  tgtWorldZ: number;
  srcSurfaceY: number;
  tgtSurfaceY: number;
  attackerColor: string;
  defenderColor: string;
  startAt: number;
  hashSeed: number;
  // Defender skirmish: hold the approach plateau open past the default
  // APPROACH_MS until the attacker's REAL (mechanical) transit delay
  // elapses, so a defender sees "company still approaching" for the actual
  // travel window rather than the firefight starting before the attacker's
  // troops have even arrived — see client-map-3d-capture-overlays.ts's
  // syncBattleOverlayFx for where this is computed.
  holdApproachUntilElapsed?: number;
};

export type MarineKit = {
  offset: number; // lineup pop-in stagger, [0, 0.22)
  perpPos: number; // formation slot along the firing line, roughly [-0.3, 0.3]
  stopDepth: number; // 0 = halts furthest forward, 1 = holds furthest back
  kneels: boolean; // fires from a knee rather than standing
  fireAt: [number, number, number]; // 3 fire-pulse centers within the firefight window, each in [0,1)
};

/** Which animation a marine should be playing this frame. The renderer maps
 * these to the model's real captured clips (PistolRun / PistolIdle /
 * PistolKneelingIdle) rather than posing bones by hand. */
export type MarineStance = "run" | "stand" | "kneel";

export type DeathKit = { roll: number; at: number };

// Overall marine model scale multiplier — applied both to the rendered mesh
// (see MARINE_MODEL_SCALE's use in popup-marine-overlay-fx.ts's
// slot.mesh.scale, and its CROUCH_DROP/FALL_DROP/FLASH_SIZE) and to the
// spacing constants below, so the squad's formation footprint grows in
// lockstep with the model instead of the marines outgrowing their own
// slots and fusing together.
//
// History: the original procedural model was "way too big" at the real
// default camera zoom, so a prior pass shrunk the model AND this file's
// spacing constants by 10x together (MARINE_SPACING 0.34 -> 0.034,
// FIRING_LINE_FWD_OFFSET 0.24 -> 0.024). That overshot — verified via
// screenshot at the story's real default cameraDistance (no override), the
// marine rendered as a 1-2px sliver, indistinguishable from the removed
// dot-swarm system it replaced, even though the detailed Meshy-rigged model
// was actually loading and posing correctly. This constant scales back up
// partway: ~3.5x off the shrunk baseline lands around 35% of the original
// "too big" size — clearly readable as a small humanoid figure at default
// zoom without reverting to giants.
export const MARINE_MODEL_SCALE = 3.5;

// Safety margin under TILE_LOCAL_MAX (the tile half-width every marine's
// LOCAL position gets clamped to before rendering — writeMarine in
// popup-marine-overlay-fx.ts does tileX + clampLocal(pose.localX)) that the
// firing-line formation is built to fit inside.
//
// Regression: MARINE_SPACING used to be a FIXED value
// (0.085 * MARINE_MODEL_SCALE) tuned only for the 4-marine squad this
// system shipped with. Widening the squad (6, then 7, to match the
// muster-transit march company) pushed the outermost marines' perpPos past
// TILE_LOCAL_MAX without anyone noticing, because every unit test reads
// computeBattlePose's RAW localX/localZ — the clamp only happens later, at
// render time. The outermost marines on each side silently collapsed onto
// the clamp boundary, reading as marines "standing on each other" at the
// end of a line that looked like it had fewer soldiers than it did. Every
// spacing constant below is now DERIVED from MARINES_PER_SIDE so it always
// fits, instead of a fixed number someone has to remember to revisit.
const FORMATION_SAFE_HALF_WIDTH = 0.85 * TILE_LOCAL_MAX;

// Formation-slot spacing along the firing line, in local tile units. Spreads
// MARINES_PER_SIDE evenly across the full safe width (see
// FORMATION_SAFE_HALF_WIDTH) rather than a fixed pitch, so the outermost
// marine's perpPos never approaches RENDER_CLAMP regardless of squad size.
// Still checked against the baked model's real footprint by a regression
// test (MARINE_FOOTPRINT_WIDTH in popup-marine-timeline.test.ts) so a much
// larger squad would fail loudly instead of silently fusing adjacent
// marines into a blob.
export const MARINE_SPACING = (2 * FORMATION_SAFE_HALF_WIDTH) / Math.max(1, MARINES_PER_SIDE - 1);

// How far each side's firing line sits back from the tile center along its
// own forward axis during the firefight — keeps the two squads (attacker
// and defender) visibly separated as distinct colored groups instead of
// converging on the same spot and fusing together.
const FIRING_LINE_FWD_OFFSET = 0.024 * MARINE_MODEL_SCALE;

// Marines don't all advance to the same firing line: each halts somewhere
// in this band (measured back from FIRING_LINE_FWD_OFFSET along its own
// forward axis) and opens fire from there, so a squad reads as soldiers
// picking their own ground rather than a rank stopping on one chalk line.
// Kept, together with FIRING_LINE_FWD_OFFSET above, under
// FORMATION_SAFE_HALF_WIDTH for the same clamp-collapse reason as
// MARINE_SPACING — a marine holding furthest back must not clamp onto the
// same depth as one further forward.
const STOP_DEPTH_SPREAD = FORMATION_SAFE_HALF_WIDTH - FIRING_LINE_FWD_OFFSET;
// Roughly this share of each squad drops to a knee to fire; the rest stay
// standing. Deterministic per marine (hash), never a coin flip at runtime,
// so a scrub/rejoin shows the same soldier kneeling as before.
const KNEEL_SHARE = 0.4;

export const marineKitFor = (seed: number, side: 0 | 1, i: number): MarineKit => {
  const slot = i - (MARINES_PER_SIDE - 1) / 2;
  const jitter = (hash01(seed * 31 + i, side, 0) - 0.5) * 0.01;
  return {
    offset: hash01(seed * 31 + i, side, 3) * 0.22,
    perpPos: slot * MARINE_SPACING + jitter,
    // 0 = pushes furthest forward, 1 = holds furthest back.
    stopDepth: hash01(seed * 31 + i, side, 60),
    kneels: hash01(seed * 31 + i, side, 61) < KNEEL_SHARE,
    fireAt: [
      0.08 + hash01(seed * 31 + i, side, 40) * 0.18,
      0.4 + hash01(seed * 31 + i, side, 41) * 0.2,
      0.72 + hash01(seed * 31 + i, side, 42) * 0.2
    ]
  };
};

/** How far back from the nominal firing line this marine halts. */
export const stopOffsetFor = (kit: MarineKit): number =>
  FIRING_LINE_FWD_OFFSET + kit.stopDepth * STOP_DEPTH_SPREAD;

export const deathKitFor = (seed: number, side: 0 | 1, i: number): DeathKit => ({
  roll: hash01(seed * 31 + i, side, 23),
  at: hash01(seed * 31 + i, side, 29)
});

// The set of marine indices (0..MARINES_PER_SIDE) that die this firefight
// for one side: the N lowest death rolls, N depending on whether this side
// is winning. Fixed counts (not independent per-marine coin flips) so a
// 4-marine squad never has a real chance of losing every member and leaving
// nothing for rout to visibly push through or scatter.
export const dyingIndicesFor = (
  deathKitForSide: (side: 0 | 1, i: number) => DeathKit,
  side: 0 | 1,
  winning: boolean
): Set<number> => {
  const n = winning ? WINNER_DEATHS : LOSER_DEATHS;
  const ranked = Array.from({ length: MARINES_PER_SIDE }, (_, i) => ({ i, roll: deathKitForSide(side, i).roll }));
  ranked.sort((a, b) => a.roll - b.roll);
  return new Set(ranked.slice(0, n).map((r) => r.i));
};

// Whether a muzzle flash should render this frame, and how intense — peaks
// right at the fire moment and fades out fast. The same fire pulse also
// launches a laser bolt (see computeBattleBolts above); the marine's own
// body keeps playing its steady firing clip rather than bobbing in and out
// of cover around each shot.
const FLASH_HALF_WIDTH = 0.025;
export const muzzleFlashIntensity = (kit: MarineKit, firefightT: number): number => {
  let best = 0;
  for (const at of kit.fireAt) {
    const d = Math.abs(firefightT - at) / FLASH_HALF_WIDTH;
    if (d < 1) best = Math.max(best, 1 - d);
  }
  return best;
};

// Laser-bolt flight and impact-spark math lives in popup-marine-bolts.ts
// (same pure-function-of-time rule, split out for the 500-line cap).

export type MarinePose = {
  /** Clip the renderer should be playing for this marine this frame. */
  stance: MarineStance;
  localX: number;
  localZ: number;
  yaw: number;
  scale: number;
  crouchT: number; // 0 = down in cover, 1 = standing/firing
  fallT: number; // 0 = upright, 1 = fully collapsed (dead)
  flash: number; // 0..1 muzzle-flash intensity this frame
};

const facingYaw = (fwdX: number, fwdZ: number): number => Math.atan2(fwdX, fwdZ);

/** Computes one marine's local-space pose for a resolved battle at `nowMs`.
 * `entryLocalX/Z` is the tile-edge cover position this side spawns from,
 * `perpX/Z`/`fwdX/Z` are the firing-line's perpendicular/forward axes (see
 * popup-marine-overlay-fx.ts for how those are derived from the attacker-
 * defender direction). */
export const computeBattlePose = (
  b: BattleOverlayRenderEntry,
  side: 0 | 1,
  i: number,
  nowMs: number,
  entryLocalX: number,
  entryLocalZ: number,
  perpX: number,
  perpZ: number,
  fwdX: number,
  fwdZ: number
): MarinePose => {
  const kit = marineKitFor(b.hashSeed, side, i);
  const dKit = deathKitFor(b.hashSeed, side, i);
  const isAttacker = side === 0;
  const winning = isAttacker ? b.attackerWon : !b.attackerWon;
  const clashEndAt = b.clashAt + CLASH_MS;
  const routElapsed = nowMs - clashEndAt;
  const yaw = facingYaw(fwdX, fwdZ);
  const dying = dyingIndicesFor((s, j) => deathKitFor(b.hashSeed, s, j), side, winning).has(i);
  const preDead =
    b.fromSkirmish &&
    nowMs >= b.startAt + APPROACH_MS + CLASH_MS &&
    dyingIndicesFor((s, j) => deathKitFor(b.hashSeed, s, j), side, true).has(i);

  // Where this marine WAITS: its own slot in the line, spread along the perp
  // axis. The advance below starts from this exact point — marching from the
  // bare entry point instead collapsed the whole squad onto one spot the
  // instant lineup ended (a "pile") before it fanned back out.
  const lineupX = entryLocalX + perpX * kit.perpPos;
  const lineupZ = entryLocalZ + perpZ * kit.perpPos;

  if (nowMs < b.startAt + LINEUP_MS) {
    const t = clamp01((nowMs - b.startAt) / LINEUP_MS);
    const scale = clamp01((t - kit.offset * 0.6) / 0.25);
    return {
      // Holding at the entry point, not advancing: a run clip here reads as
      // running on the spot, so wait in the firing stance instead.
      stance: kit.kneels ? "kneel" : "stand",
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

  // Each marine advances toward ITS OWN halt point (see stopOffsetFor), so
  // the squad ends up staggered in depth instead of dressing one straight
  // line, and a marine that stops further back finishes advancing — and so
  // starts firing — sooner than one pushing right up to the front.
  const firingX = perpX * kit.perpPos - fwdX * stopOffsetFor(kit);
  const firingZ = perpZ * kit.perpPos - fwdZ * stopOffsetFor(kit);
  const firingStance: MarineStance = kit.kneels ? "kneel" : "stand";

  if (nowMs < b.clashAt) {
    const marchT = clamp01((nowMs - b.startAt - LINEUP_MS) / MARCH_MS);
    const localT = clamp01((marchT - kit.offset) / (0.7 - kit.offset));
    // Only play the run clip while the marine is actually translating.
    // localT sits at 0 through this marine's staggered start delay and at 1
    // after it halts; running in place at either end looks broken.
    const moving = localT > 0 && localT < 1;
    return {
      stance: moving ? "run" : firingStance,
      localX: lineupX * (1 - localT) + firingX * localT,
      localZ: lineupZ * (1 - localT) + firingZ * localT,
      yaw, scale: 1, crouchT: 1, fallT: 0, flash: 0
    };
  }

  if (preDead) {
    return { stance: firingStance, localX: firingX, localZ: firingZ, yaw, scale: 0, crouchT: 0, fallT: 1, flash: 0 };
  }

  if (nowMs < clashEndAt) {
    const t = clamp01((nowMs - b.clashAt) / CLASH_MS);
    const flash = muzzleFlashIntensity(kit, t);
    if (dying && t >= dKit.at) {
      const fallT = clamp01((t - dKit.at) / DEATH_FADE_T);
      return { stance: firingStance, localX: firingX, localZ: firingZ, yaw, scale: 1 - fallT * 0.4, crouchT: 1 - fallT, fallT, flash: 0 };
    }
    return { stance: firingStance, localX: firingX, localZ: firingZ, yaw, scale: 1, crouchT: 1, fallT: 0, flash };
  }

  if (dying) {
    // Already fell during the firefight above — stays collapsed through rout.
    return { stance: firingStance, localX: firingX, localZ: firingZ, yaw, scale: 0.6, crouchT: 0, fallT: 1, flash: 0 };
  }

  const routT = clamp01(routElapsed / ROUT_MS);
  let routX: number;
  let routZ: number;
  let crouchT: number;
  if (winning) {
    const push = routT * 0.3;
    routX = fwdX * push + perpX * kit.perpPos;
    routZ = fwdZ * push + perpZ * kit.perpPos;
    crouchT = 1;
  } else {
    const retreat = routT * 0.5;
    const scatter = 1 + routT * 1.4;
    routX = entryLocalX - fwdX * retreat + perpX * kit.perpPos * scatter;
    routZ = entryLocalZ - fwdZ * retreat + perpZ * kit.perpPos * scatter;
    crouchT = 0.1;
  }
  const settleT = clamp01(routT / ROUT_SETTLE_T);
  const preCrouch = 1; // marines were standing/aiming throughout the firefight, not crouched
  const localX = settleT < 1 ? firingX * (1 - settleT) + routX * settleT : routX;
  const localZ = settleT < 1 ? firingZ * (1 - settleT) + routZ * settleT : routZ;
  const blendedCrouch = settleT < 1 ? preCrouch * (1 - settleT) + crouchT * settleT : crouchT;
  // Both sides are on the move during the rout (winner pushing through,
  // loser falling back), so both run rather than holding a firing stance.
  return { stance: "run", localX, localZ, yaw, scale: winning ? 1 : 1 - routT * 0.15, crouchT: blendedCrouch, fallT: 0, flash: 0 };
};

/** Same pose math as computeBattlePose but for the indefinite pre-resolution
 * skirmish loop — one-time cover/advance, then a looping firefight with no
 * rout phase. Shares the exact cover/advance formulas (via the same
 * kit-derived offsets) so a resolved battle picking up from this skirmish's
 * startAt never pops. */
export const computeSkirmishPose = (
  b: BattleOverlaySkirmishEntry,
  side: 0 | 1,
  i: number,
  nowMs: number,
  entryLocalX: number,
  entryLocalZ: number,
  perpX: number,
  perpZ: number,
  fwdX: number,
  fwdZ: number
): MarinePose => {
  const kit = marineKitFor(b.hashSeed, side, i);
  const dKit = deathKitFor(b.hashSeed, side, i);
  const yaw = facingYaw(fwdX, fwdZ);
  const elapsed = nowMs - b.startAt;
  // Normally the firefight starts exactly APPROACH_MS after this skirmish
  // was first seen — but a DEFENDER's skirmish holds that plateau open past
  // APPROACH_MS until the attacker's real (mechanical) transit delay
  // elapses, so the fight doesn't start visually before the attacker's
  // troops have actually arrived. See BattleOverlaySkirmishEntry's comment.
  const approachMs = Math.max(APPROACH_MS, b.holdApproachUntilElapsed ?? 0);
  const firstFirefightT = (nowMs - (b.startAt + approachMs)) / CLASH_MS;
  const dying = dyingIndicesFor((s, j) => deathKitFor(b.hashSeed, s, j), side, true).has(i);

  // See computeBattlePose: the advance starts from this waiting slot, not
  // from the bare entry point.
  const lineupX = entryLocalX + perpX * kit.perpPos;
  const lineupZ = entryLocalZ + perpZ * kit.perpPos;

  if (elapsed < LINEUP_MS) {
    const t = clamp01(elapsed / LINEUP_MS);
    const scale = clamp01((t - kit.offset * 0.6) / 0.25);
    return {
      // Holding at the entry point, not advancing: a run clip here reads as
      // running on the spot, so wait in the firing stance instead.
      stance: kit.kneels ? "kneel" : "stand",
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
    const marchT = clamp01((elapsed - LINEUP_MS) / MARCH_MS);
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
  const flash = muzzleFlashIntensity(kit, cycleT);

  if (dying && firstFirefightT >= dKit.at && firstFirefightT < 1) {
    const fallT = clamp01((firstFirefightT - dKit.at) / DEATH_FADE_T);
    return { stance: firingStance, localX: firingX, localZ: firingZ, yaw, scale: 1 - fallT * 0.4, crouchT: 1 - fallT, fallT, flash: 0 };
  }
  if (dying && firstFirefightT >= 1) {
    return { stance: firingStance, localX: firingX, localZ: firingZ, yaw, scale: 0.6, crouchT: 0, fallT: 1, flash: 0 };
  }

  return { stance: firingStance, localX: firingX, localZ: firingZ, yaw, scale: 1, crouchT: 1, fallT: 0, flash };
};
