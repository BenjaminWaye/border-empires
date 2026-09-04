// Pure timing/pose math for the true-3D pop-up-marine battle overlay. No
// three.js import here on purpose: this module is exercised by plain vitest
// (node environment, no WebGL/DOM) so the pose math itself can be unit
// tested independently of the InstancedMesh plumbing in
// popup-marine-overlay-fx.ts, which is the only file that turns these
// outputs into a Matrix4.
//
// Same phase shape as the dot-swarm system it replaces (see git history for
// client-map-3d-battle-overlay-fx.ts): cover -> advance -> firefight -> rout,
// driven entirely by server-resolved outcomes. The animation never decides
// anything — attackerWon is already known before the first frame renders;
// this module only stages the reveal. The whole fight happens on the target
// tile (the tile under attack), clamped to TILE_LOCAL_MAX same as before.
export const LINEUP_MS = 2500; // "cover" — squad rushes to position, staggered pop-in
export const MARCH_MS = 900; // "advance" — squad closes from tile edge to the firing line
export const APPROACH_MS = LINEUP_MS + MARCH_MS;
export const CLASH_MS = 1300; // "firefight" — pop up, aim, fire in bursts, casualties
export const ROUT_MS = 950; // winner pushes through, loser ducks and scatters
export const BATTLE_OVERLAY_TOTAL_MS = APPROACH_MS + CLASH_MS + ROUT_MS;

export const MARINES_PER_SIDE = 4;
export const WINNER_DEATHS = 1;
export const LOSER_DEATHS = 2;
// Fraction of CLASH_MS a falling marine takes to finish collapsing once its
// death moment (DeathKit.at) arrives.
const DEATH_FADE_T = 0.16;
// Fraction of ROUT_MS spent blending out of the firefight's own crouch/pop
// jitter (see crouchPulse) rather than snapping straight into the rout pose.
const ROUT_SETTLE_T = 0.15;

const TILE_LOCAL_MAX = 0.46;
export const clampLocal = (v: number): number => Math.max(-TILE_LOCAL_MAX, Math.min(TILE_LOCAL_MAX, v));
export const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

function hash01(a: number, b: number, salt: number): number {
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
};

export type MarineKit = {
  offset: number; // lineup pop-in stagger, [0, 0.22)
  perpPos: number; // formation slot along the firing line, roughly [-0.3, 0.3]
  swayFreq: number;
  swayPhase: number;
  fireAt: [number, number, number]; // 3 fire-pulse centers within the firefight window, each in [0,1)
};

export type DeathKit = { roll: number; at: number };

export const marineKitFor = (seed: number, side: 0 | 1, i: number): MarineKit => {
  const slot = i - (MARINES_PER_SIDE - 1) / 2;
  const jitter = (hash01(seed * 31 + i, side, 0) - 0.5) * 0.08;
  return {
    offset: hash01(seed * 31 + i, side, 3) * 0.22,
    perpPos: slot * 0.16 + jitter,
    swayFreq: 5 + hash01(seed * 31 + i, side, 1) * 6,
    swayPhase: hash01(seed * 31 + i, side, 2) * Math.PI * 2,
    fireAt: [
      0.08 + hash01(seed * 31 + i, side, 40) * 0.18,
      0.4 + hash01(seed * 31 + i, side, 41) * 0.2,
      0.72 + hash01(seed * 31 + i, side, 42) * 0.2
    ]
  };
};

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

// How "up out of cover" a marine is at a given point in the firefight
// window (0 = fully crouched behind cover, 1 = standing and firing),
// peaking briefly around each of its own fireAt pulses.
const FIRE_POP_HALF_WIDTH = 0.09;
export const crouchPulse = (kit: MarineKit, firefightT: number): number => {
  let best = 0;
  for (const at of kit.fireAt) {
    const d = Math.abs(firefightT - at) / FIRE_POP_HALF_WIDTH;
    if (d < 1) best = Math.max(best, 1 - d);
  }
  return clamp01(best * 1.4);
};

// Whether a muzzle flash should render this frame, and how intense — peaks
// right at the fire moment and fades out fast, distinct from the (slower)
// crouchPulse rise/fall so the flash reads as a discrete shot rather than
// tracking the pop-up motion 1:1.
const FLASH_HALF_WIDTH = 0.025;
export const muzzleFlashIntensity = (kit: MarineKit, firefightT: number): number => {
  let best = 0;
  for (const at of kit.fireAt) {
    const d = Math.abs(firefightT - at) / FLASH_HALF_WIDTH;
    if (d < 1) best = Math.max(best, 1 - d);
  }
  return best;
};

export type MarinePose = {
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

  if (nowMs < b.startAt + LINEUP_MS) {
    const t = clamp01((nowMs - b.startAt) / LINEUP_MS);
    const scale = clamp01((t - kit.offset * 0.6) / 0.25);
    const sway = Math.sin(nowMs / (kit.swayFreq * 20) + kit.swayPhase) * 0.015;
    return {
      localX: entryLocalX + perpX * (kit.perpPos + sway),
      localZ: entryLocalZ + perpZ * (kit.perpPos + sway),
      yaw, scale, crouchT: 0, fallT: 0, flash: 0
    };
  }

  if (nowMs < b.clashAt) {
    const marchT = clamp01((nowMs - b.startAt - LINEUP_MS) / MARCH_MS);
    const localT = clamp01((marchT - kit.offset) / (0.7 - kit.offset));
    return {
      localX: entryLocalX * (1 - localT) + perpX * kit.perpPos,
      localZ: entryLocalZ * (1 - localT) + perpZ * kit.perpPos,
      yaw, scale: 1, crouchT: localT * 0.3, fallT: 0, flash: 0
    };
  }

  const firingX = perpX * kit.perpPos - fwdX * 0.09;
  const firingZ = perpZ * kit.perpPos - fwdZ * 0.09;

  if (preDead) {
    return { localX: firingX, localZ: firingZ, yaw, scale: 0, crouchT: 0, fallT: 1, flash: 0 };
  }

  if (nowMs < clashEndAt) {
    const t = clamp01((nowMs - b.clashAt) / CLASH_MS);
    const crouchT = crouchPulse(kit, t);
    const flash = muzzleFlashIntensity(kit, t);
    if (dying && t >= dKit.at) {
      const fallT = clamp01((t - dKit.at) / DEATH_FADE_T);
      return { localX: firingX, localZ: firingZ, yaw, scale: 1 - fallT * 0.4, crouchT: crouchT * (1 - fallT), fallT, flash: 0 };
    }
    return { localX: firingX, localZ: firingZ, yaw, scale: 1, crouchT, fallT: 0, flash };
  }

  if (dying) {
    // Already fell during the firefight above — stays collapsed through rout.
    return { localX: firingX, localZ: firingZ, yaw, scale: 0.6, crouchT: 0, fallT: 1, flash: 0 };
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
  const preCrouch = crouchPulse(kit, 1);
  const localX = settleT < 1 ? firingX * (1 - settleT) + routX * settleT : routX;
  const localZ = settleT < 1 ? firingZ * (1 - settleT) + routZ * settleT : routZ;
  const blendedCrouch = settleT < 1 ? preCrouch * (1 - settleT) + crouchT * settleT : crouchT;
  return { localX, localZ, yaw, scale: winning ? 1 : 1 - routT * 0.15, crouchT: blendedCrouch, fallT: 0, flash: 0 };
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
  const firstFirefightT = (nowMs - (b.startAt + APPROACH_MS)) / CLASH_MS;
  const dying = dyingIndicesFor((s, j) => deathKitFor(b.hashSeed, s, j), side, true).has(i);

  if (elapsed < LINEUP_MS) {
    const t = clamp01(elapsed / LINEUP_MS);
    const scale = clamp01((t - kit.offset * 0.6) / 0.25);
    const sway = Math.sin(nowMs / (kit.swayFreq * 20) + kit.swayPhase) * 0.015;
    return {
      localX: entryLocalX + perpX * (kit.perpPos + sway),
      localZ: entryLocalZ + perpZ * (kit.perpPos + sway),
      yaw, scale, crouchT: 0, fallT: 0, flash: 0
    };
  }

  if (elapsed < APPROACH_MS) {
    const marchT = clamp01((elapsed - LINEUP_MS) / MARCH_MS);
    const localT = clamp01((marchT - kit.offset) / (0.7 - kit.offset));
    return {
      localX: entryLocalX * (1 - localT) + perpX * kit.perpPos,
      localZ: entryLocalZ * (1 - localT) + perpZ * kit.perpPos,
      yaw, scale: 1, crouchT: localT * 0.3, fallT: 0, flash: 0
    };
  }

  const firingX = perpX * kit.perpPos - fwdX * 0.09;
  const firingZ = perpZ * kit.perpPos - fwdZ * 0.09;
  const cycleT = clamp01(((elapsed - APPROACH_MS) % CLASH_MS) / CLASH_MS);
  const crouchT = crouchPulse(kit, cycleT);
  const flash = muzzleFlashIntensity(kit, cycleT);

  if (dying && firstFirefightT >= dKit.at && firstFirefightT < 1) {
    const fallT = clamp01((firstFirefightT - dKit.at) / DEATH_FADE_T);
    return { localX: firingX, localZ: firingZ, yaw, scale: 1 - fallT * 0.4, crouchT: crouchT * (1 - fallT), fallT, flash: 0 };
  }
  if (dying && firstFirefightT >= 1) {
    return { localX: firingX, localZ: firingZ, yaw, scale: 0.6, crouchT: 0, fallT: 1, flash: 0 };
  }

  return { localX: firingX, localZ: firingZ, yaw, scale: 1, crouchT, fallT: 0, flash };
};
