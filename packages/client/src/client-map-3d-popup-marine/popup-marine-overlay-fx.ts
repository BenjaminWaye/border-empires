// Renders every concurrently active combat as a small squad of space-marine
// soldiers per side (MARINES_PER_SIDE, see popup-marine-timeline.ts) that
// rush in from the target tile's edge, each halt at its own chosen distance,
// hold a standing or kneeling firing stance while trading laser bolts, and
// finish by either pushing through (winner) or scattering (loser) — driven
// entirely by server-resolved outcomes. See PopupMarineOverlayFx.stories.ts
// and client-battle-overlay.ts for how state.activeBattles gets populated.
// The animation never decides anything — attackerWon is already known before
// the first frame renders; this module only stages the reveal.
//
// Rendering approach: a pool of up to MAX_MARINES cloned model roots per
// side, each with its own AnimationMixer playing the model's REAL captured
// clips (PistolRun / PistolIdle / PistolKneelingIdle — see
// popup-marine-asset.ts). The timeline decides WHICH clip via
// MarinePose.stance; this file only plays it. Clip time is derived from
// nowMs rather than accumulated frame deltas, so scrubbing or rejoining a
// siege mid-fight lands on the same frame instead of wherever a stateful
// playhead drifted to.
//
// This trades "one draw call for all marines on a side" for "two draw calls
// per marine" — the body plus its occlusion silhouette (see
// popup-marine-occlusion-silhouette.ts), which keeps a marine visible behind
// or inside anything on its tile — (up to ~160 marine slots total,
// MAX_CONCURRENT_BATTLES * MARINES_PER_SIDE * 2 sides), plus one
// skeletal-animation evaluation each.
// That is the known cost ceiling of this design; if it ever bites, the
// scalable fix is GPU-side instanced skinning (baking clips into a texture
// and sampling them in a vertex shader), not micro-tuning here.
// Muzzle-flash and laser bolts stay InstancedMesh — they have no bones.
//
// Also draws the capture-hold garrison (popup-marine-garrison.ts): the squad
// that took a tile standing on it for the hold window, which then defends
// it in any fight there.
//
// True-3D renderer only (see client-map-3d/client-map-3d.ts's
// isTrue3DRendererActive() gate) — the 2D canvas renderer has no equivalent
// animation and never did (the garrison gets a 2D marker instead, see
// client-map-2d-capture-hold-overlay.ts); see AGENTS.md's renderer-parity note and the PR
// description for why that's a documented scope decision, not a
// regression.
import { Matrix4, Quaternion, Scene, Vector3 } from "three";
import { loadPopupMarineTemplate } from "./popup-marine-asset.js";
import { createMarineSlot, disposeMarineSlot, playMarineStance, type MarineSlot } from "./popup-marine-slot.js";
import {
  APPROACH_MS,
  MARINES_PER_SIDE,
  MARINE_MODEL_SCALE,
  computeBattlePose,
  computeSkirmishPose,
  clampLocal,
  type BattleOverlayRenderEntry,
  type BattleOverlaySkirmishEntry,
  type MarinePose
} from "./popup-marine-timeline.js";
import { computeGarrisonPose, garrisonStartFor, type GarrisonRenderEntry } from "./popup-marine-garrison.js";
import { battleSiegeVictim, createSiegeKillTracker, skirmishSiegeVictim, tileHashSeed } from "./popup-marine-siege-victim.js";
import {
  computeBattleBolts,
  computeBattleImpacts,
  computeSkirmishBolts,
  computeSkirmishImpacts
} from "./popup-marine-bolts.js";
import { createFlashMesh } from "./popup-marine-effect-meshes.js";
import { createShotRenderer } from "./popup-marine-shot-render.js";
import { createBattleStrikeFxLayer, STRIKE_LEAD_MS } from "./popup-marine-strike-fx.js";

export {
  LINEUP_MS,
  MARCH_MS,
  APPROACH_MS,
  CLASH_MS,
  ROUT_MS,
  BATTLE_OVERLAY_TOTAL_MS,
  type BattleOverlayRenderEntry,
  type BattleOverlaySkirmishEntry
} from "./popup-marine-timeline.js";
export { tileHashSeed } from "./popup-marine-siege-victim.js";

const MAX_CONCURRENT_BATTLES = 16;
const MAX_MARINES = MAX_CONCURRENT_BATTLES * MARINES_PER_SIDE;
const MARINE_Y_OFFSET = 0;
// Muzzle-flash cone size — kept in step with MARINE_MODEL_SCALE so the
// flash reads proportionally to the (now bigger) marine instead of looking
// tiny next to it.
const FLASH_SIZE = 0.006 * MARINE_MODEL_SCALE;
// Small forward offset from the pistol hand bone's own origin to the muzzle
// tip, in that bone's local (unscaled) space. This does NOT need
// MARINE_MODEL_SCALE applied: writeFlash reads it via the bone's live
// matrixWorld, which already carries the whole model-scale chain inherited
// from the marine root's scale below, so the flash stays attached to the
// muzzle at any model scale without double-scaling this offset.
const MUZZLE_LOCAL_OFFSET = new Vector3(0, 0, 0.017);
// How far a collapsed (killed) marine sinks, in tile-local units — applied
// to the root's position rather than mesh-local space, so unlike
// MUZZLE_LOCAL_OFFSET this DOES need MARINE_MODEL_SCALE applied directly to
// stay visually proportional to the model.
const FALL_DROP = 0.018 * MARINE_MODEL_SCALE;
const UP_AXIS = new Vector3(0, 1, 0);
// Axis a killed marine topples around.
const FWD_AXIS = new Vector3(0, 0, 1);
// Up to 3 fire pulses can be in flight per marine at once (one per fireAt);
// the shot renderer sizes its own bolt/spark pools from this.
const MAX_BOLTS = MAX_MARINES * 2 * 3;

export type BattleOverlayFx = ReturnType<typeof createPopupMarineOverlayFx>;

export function createPopupMarineOverlayFx(scene: Scene) {
  const flashFx = createFlashMesh(scene, FLASH_SIZE, MAX_MARINES * 2);
  const flashMesh = flashFx.mesh;
  const shots = createShotRenderer(scene, MARINE_MODEL_SCALE, MAX_BOLTS);
  const strikeFx = createBattleStrikeFxLayer(scene);
  // key -> the effective clash time (nowMs clock) it was fired for, so this
  // can be pruned as battles resolve/expire instead of growing forever over
  // a long session — see AGENTS.md's state/persistence discipline note.
  const struckAt = new Map<string, number>();
  // Siege-tower "kill shot" attribution/dedup — see popup-marine-siege-victim.ts.
  const siegeKillTracker = createSiegeKillTracker(strikeFx);

  let disposed = false;


  let attackerPool: MarineSlot[] = [];
  let defenderPool: MarineSlot[] = [];


  loadPopupMarineTemplate()
    .then((template) => {
      if (disposed) return;
      attackerPool = Array.from({ length: MAX_MARINES }, (_, i) => createMarineSlot(scene, template, i));
      defenderPool = Array.from({ length: MAX_MARINES }, (_, i) => createMarineSlot(scene, template, i));
    })
    .catch((err: unknown) => {
      // Nothing renders rather than crashing the whole 3D map: the overlay's
      // pools simply stay empty, so a battle shows its tile highlight with no
      // marines instead of taking down the renderer.
      console.error("popup-marine model failed to load; battle marines will not render", err);
    });

  const tmpQuat = new Quaternion();
  const fallQuat = new Quaternion();
  const flashPos = new Vector3();
  const flashM = new Matrix4();
  const flashQuat = new Quaternion();
  const flashScale = new Vector3();

  const clear = (): void => {
    for (const slot of attackerPool) slot.root.visible = false;
    for (const slot of defenderPool) slot.root.visible = false;
    flashMesh.count = 0;
    shots.clear();
    strikeFx.clear();
    struckAt.clear();
    siegeKillTracker.clear();
  };

  /** Fires the opening-strike beam exactly once per (tile, approach) —
   * `effectiveClashAt` is the nowMs-clock moment the firefight begins, so a
   * key of hashSeed+that moment is stable across frames of the same
   * approach but distinct from a later battle that reuses the same tile. */
  const maybeFireStrike = (key: string, effectiveClashAt: number, tileX: number, tileY: number, tileZ: number, nowMs: number): void => {
    if (struckAt.get(key) === effectiveClashAt) return;
    const dueAt = effectiveClashAt - STRIKE_LEAD_MS;
    if (nowMs < dueAt || nowMs >= effectiveClashAt) return;
    struckAt.set(key, effectiveClashAt);
    strikeFx.spawn(tileX, tileZ, tileY, nowMs);
  };


  const writeMarine = (
    slot: MarineSlot,
    color: string,
    tileX: number,
    tileY: number,
    tileZ: number,
    pose: MarinePose,
    nowMs: number
  ): void => {
    const yOffset = -FALL_DROP * pose.fallT;
    slot.root.visible = pose.scale > 0;
    if (!slot.root.visible) return;
    slot.root.position.set(tileX + clampLocal(pose.localX), tileY + MARINE_Y_OFFSET + yOffset, tileZ + clampLocal(pose.localZ));
    tmpQuat.setFromAxisAngle(UP_AXIS, pose.yaw);
    if (pose.fallT > 0) {
      fallQuat.setFromAxisAngle(FWD_AXIS, (Math.PI / 2) * pose.fallT);
      tmpQuat.multiply(fallQuat);
    }
    slot.root.quaternion.copy(tmpQuat);
    slot.root.scale.setScalar(Math.max(0, pose.scale) * MARINE_MODEL_SCALE);
    slot.material.color.set(color);
    slot.silhouette.material.color.set(color);
    // A falling marine is sinking out of the fight on purpose; don't x-ray
    // it back up through the ground (see popup-marine-occlusion-silhouette.ts).
    slot.silhouette.visible = pose.fallT <= 0;
    playMarineStance(slot, pose.stance, nowMs);
    slot.root.updateMatrixWorld(true);
  };

  const writeFlash = (writeIndex: number, slot: MarineSlot, pose: MarinePose): number => {
    if (pose.flash <= 0 || !slot.root.visible) return writeIndex;
    // Read the pistol hand bone's live world matrix so the flash tracks the
    // arm's actual animated pose instead of a fixed whole-body offset.
    const hand = slot.handBone;
    if (!hand) return writeIndex;
    flashPos.copy(MUZZLE_LOCAL_OFFSET).applyMatrix4(hand.matrixWorld);
    flashQuat.setFromAxisAngle(UP_AXIS, pose.yaw);
    flashScale.setScalar(pose.flash);
    flashM.compose(flashPos, flashQuat, flashScale);
    flashMesh.setMatrixAt(writeIndex, flashM);
    return writeIndex + 1;
  };

  const tick = (
    nowMs: number,
    battles: BattleOverlayRenderEntry[],
    skirmishes: BattleOverlaySkirmishEntry[] = [],
    // The tile a siege tower is currently locked onto (see
    // client-map-3d-siege-tower-overlay.ts), if any real tower exists on the
    // map — undefined when there is no tower to attribute a kill shot to.
    siegeTowerTarget?: { x: number; y: number },
    // Capture-held tiles' standing squads (popup-marine-garrison.ts), drawn
    // after real fights so they never take a slot a battle needs.
    garrisons: GarrisonRenderEntry[] = []
  ): void => {
    if (battles.length === 0 && skirmishes.length === 0 && garrisons.length === 0) { clear(); return; }
    const siegeTargetHash = siegeTowerTarget ? tileHashSeed(siegeTowerTarget.x, siegeTowerTarget.y) : undefined;

    // Prune stale strike dedup entries (a battle that resolved/expired
    // without ever crossing STRIKE_LEAD_MS, e.g. a resolved battle that
    // starts already standing at the firing line — see
    // client-battle-overlay.ts) so this map never grows unbounded.
    for (const [key, effectiveClashAt] of struckAt) {
      if (nowMs > effectiveClashAt) struckAt.delete(key);
    }
    siegeKillTracker.prune(nowMs);

    for (const slot of attackerPool) slot.root.visible = false;
    for (const slot of defenderPool) slot.root.visible = false;

    let atkWrite = 0;
    let defWrite = 0;
    let flashWrite = 0;
    let slotCount = 0;
    shots.beginFrame();

    const writeOne = (pool: MarineSlot[], writeIndex: number, color: string, tileX: number, tileY: number, tileZ: number, pose: MarinePose): void => {
      const slot = pool[writeIndex];
      if (!slot) return;
      writeMarine(slot, color, tileX, tileY, tileZ, pose, nowMs);
      flashWrite = writeFlash(flashWrite, slot, pose);
    };

    for (let bIdx = 0; bIdx < battles.length && slotCount < MAX_CONCURRENT_BATTLES; bIdx++, slotCount++) {
      const b = battles[bIdx]!;
      const dirX = b.tgtWorldX - b.srcWorldX;
      const dirZ = b.tgtWorldZ - b.srcWorldZ;
      const dist = Math.sqrt(dirX * dirX + dirZ * dirZ);
      if (dist < 0.001) continue;
      const ux = dirX / dist;
      const uz = dirZ / dist;
      const perpX = -uz;
      const perpZ = ux;
      const tileX = b.tgtWorldX;
      const tileZ = b.tgtWorldZ;
      const tileY = b.tgtSurfaceY;
      // Resolved battles start already standing at the firing line
      // (clashAt backdated to ~nowMs at registration — see
      // client-battle-overlay.ts), so this window has, in the overwhelming
      // majority of cases, already closed by the first frame that sees the
      // battle; the strike beam plays for the skirmish approach below
      // instead. Kept here too so a battle whose clashAt is still ahead
      // (e.g. a slow first frame) still gets its shot.
      maybeFireStrike(`b:${b.hashSeed}`, b.clashAt, tileX, tileY, tileZ, nowMs);
      const battleVictim = siegeTargetHash === b.hashSeed ? battleSiegeVictim(b) : undefined;
      siegeKillTracker.fire(`bk:${b.hashSeed}`, b.hashSeed, battleVictim, tileX, tileY, tileZ, perpX, perpZ, ux, uz, nowMs);

      for (let side = 0 as 0 | 1; side < 2; side++) {
        const isAttacker = side === 0;
        const entryLocalX = isAttacker ? -ux * 0.46 : ux * 0.46;
        const entryLocalZ = isAttacker ? -uz * 0.46 : uz * 0.46;
        const fwdX = isAttacker ? ux : -ux;
        const fwdZ = isAttacker ? uz : -uz;
        const pool = isAttacker ? attackerPool : defenderPool;
        const color = isAttacker ? b.attackerColor : b.defenderColor;

        shots.beginSide(side);
        for (let i = 0; i < MARINES_PER_SIDE; i++) {
          const garrisonStart = isAttacker ? undefined : garrisonStartFor(b.defenderGarrison, b.hashSeed, i);
          const pose = computeBattlePose(b, side, i, nowMs, entryLocalX, entryLocalZ, perpX, perpZ, fwdX, fwdZ, battleVictim?.index, garrisonStart);
          const writeIndex = isAttacker ? atkWrite : defWrite;
          writeOne(pool, writeIndex, color, tileX, tileY, tileZ, pose);
          // A marine that is dead/collapsed this frame has stopped shooting.
          const down = pose.fallT > 0 || pose.scale <= 0;
          shots.push(
            side,
            tileX + clampLocal(pose.localX),
            tileY + MARINE_Y_OFFSET,
            tileZ + clampLocal(pose.localZ),
            down ? [] : computeBattleBolts(b, side, i, nowMs),
            down ? [] : computeBattleImpacts(b, side, i, nowMs)
          );
          if (isAttacker) atkWrite++; else defWrite++;
        }
      }
      shots.emit(b.hashSeed, b.attackerColor, b.defenderColor);
    }

    for (let s = 0; s < skirmishes.length && slotCount < MAX_CONCURRENT_BATTLES; s++, slotCount++) {
      const b = skirmishes[s]!;
      const dirX = b.tgtWorldX - b.srcWorldX;
      const dirZ = b.tgtWorldZ - b.srcWorldZ;
      const dist = Math.sqrt(dirX * dirX + dirZ * dirZ);
      if (dist < 0.001) continue;
      const ux = dirX / dist;
      const uz = dirZ / dist;
      const perpX = -uz;
      const perpZ = ux;
      const tileX = b.tgtWorldX;
      const tileZ = b.tgtWorldZ;
      const tileY = b.tgtSurfaceY;
      // The main case this beam is built for: a live pre-resolution approach
      // (see client-map-3d-capture-overlays.ts's pushSkirmish) runs the real
      // LINEUP_MS/MARCH_MS march, so this window lands right before the
      // squads' firefight starts — mirrors computeSkirmishPose/skirmishCycleT's
      // own approachMs-with-hold override so the strike never lands ahead of
      // a held (in-transit) approach.
      maybeFireStrike(`s:${b.hashSeed}`, b.startAt + Math.max(APPROACH_MS, b.holdApproachUntilElapsed ?? 0), tileX, tileY, tileZ, nowMs);
      const skirmishVictim = siegeTargetHash === b.hashSeed ? skirmishSiegeVictim(b) : undefined;
      siegeKillTracker.fire(`sk:${b.hashSeed}`, b.hashSeed, skirmishVictim, tileX, tileY, tileZ, perpX, perpZ, ux, uz, nowMs);

      for (let side = 0 as 0 | 1; side < 2; side++) {
        const isAttacker = side === 0;
        const entryLocalX = isAttacker ? -ux * 0.46 : ux * 0.46;
        const entryLocalZ = isAttacker ? -uz * 0.46 : uz * 0.46;
        const fwdX = isAttacker ? ux : -ux;
        const fwdZ = isAttacker ? uz : -uz;
        const pool = isAttacker ? attackerPool : defenderPool;
        const color = isAttacker ? b.attackerColor : b.defenderColor;

        shots.beginSide(side);
        for (let i = 0; i < MARINES_PER_SIDE; i++) {
          const garrisonStart = isAttacker ? undefined : garrisonStartFor(b.defenderGarrison, b.hashSeed, i);
          const pose = computeSkirmishPose(b, side, i, nowMs, entryLocalX, entryLocalZ, perpX, perpZ, fwdX, fwdZ, skirmishVictim?.index, garrisonStart);
          const writeIndex = isAttacker ? atkWrite : defWrite;
          writeOne(pool, writeIndex, color, tileX, tileY, tileZ, pose);
          const down = pose.fallT > 0 || pose.scale <= 0;
          shots.push(
            side,
            tileX + clampLocal(pose.localX),
            tileY + MARINE_Y_OFFSET,
            tileZ + clampLocal(pose.localZ),
            down ? [] : computeSkirmishBolts(b, side, i, nowMs),
            down ? [] : computeSkirmishImpacts(b, side, i, nowMs)
          );
          if (isAttacker) atkWrite++; else defWrite++;
        }
      }
      shots.emit(b.hashSeed, b.attackerColor, b.defenderColor);
    }

    for (let g = 0; g < garrisons.length && slotCount < MAX_CONCURRENT_BATTLES; g++, slotCount++) {
      const garrison = garrisons[g]!;
      for (let i = 0; i < MARINES_PER_SIDE; i++) {
        writeOne(defenderPool, defWrite, garrison.color, garrison.tgtWorldX, garrison.tgtSurfaceY, garrison.tgtWorldZ, computeGarrisonPose(garrison, i, nowMs));
        defWrite++;
      }
    }

    flashFx.commit(flashWrite);
    shots.commit();
    strikeFx.update(nowMs);
  };

  const dispose = (): void => {
    disposed = true;
    flashFx.dispose();
    shots.dispose();
    strikeFx.dispose();
    for (const slot of attackerPool) disposeMarineSlot(scene, slot);
    for (const slot of defenderPool) disposeMarineSlot(scene, slot);
    attackerPool = [];
    defenderPool = [];
  };

  return { tick, clear, dispose };
}
