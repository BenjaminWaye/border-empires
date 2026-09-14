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
// This trades "one draw call for all marines on a side" for "one draw call
// per marine" (up to ~160 marine slots total, MAX_CONCURRENT_BATTLES *
// MARINES_PER_SIDE * 2 sides), plus one skeletal-animation evaluation each.
// That is the known cost ceiling of this design; if it ever bites, the
// scalable fix is GPU-side instanced skinning (baking clips into a texture
// and sampling them in a vertex shader), not micro-tuning here.
// Muzzle-flash and laser bolts stay InstancedMesh — they have no bones.
//
// True-3D renderer only (see client-map-3d/client-map-3d.ts's
// isTrue3DRendererActive() gate) — the 2D canvas renderer has no equivalent
// animation and never did; see AGENTS.md's renderer-parity note and the PR
// description for why that's a documented scope decision, not a
// regression.
import {
  AnimationMixer,
  Color,
  Matrix4,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Scene,
  SkinnedMesh,
  Vector3,
  type AnimationAction
} from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import {
  MARINE_CLIP_NAMES,
  firstSkinnedMesh,
  loadPopupMarineTemplate,
  type PopupMarineTemplate
} from "./popup-marine-asset.js";
import {
  MARINES_PER_SIDE,
  MARINE_MODEL_SCALE,
  computeBattlePose,
  computeSkirmishPose,
  clampLocal,
  type BattleOverlayRenderEntry,
  type BattleOverlaySkirmishEntry,
  type MarinePose,
  type MarineStance
} from "./popup-marine-timeline.js";
import {
  computeBattleBolts,
  computeBattleImpacts,
  computeSkirmishBolts,
  computeSkirmishImpacts
} from "./popup-marine-bolts.js";
import { createFlashMesh } from "./popup-marine-effect-meshes.js";
import { createShotRenderer } from "./popup-marine-shot-render.js";

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
// Rig bone the muzzle flash is pinned to (the Mixamo humanoid's pistol hand).
const HAND_BONE_NAME = "RightHand";
// Seconds of crossfade when a marine changes stance (running -> firing, etc).
const STANCE_FADE_S = 0.18;

type MarineSlot = {
  /** Whole cloned model root — the asset carries its scale on its own root
   * node, so the group (not the bare SkinnedMesh) is what gets placed. */
  root: Object3D;
  material: MeshStandardMaterial;
  mixer: AnimationMixer;
  actions: Record<MarineStance, AnimationAction>;
  /** Bone the muzzle flash hangs off, if the rig exposes a hand. */
  handBone: Object3D | undefined;
  /** Phase offset (seconds) so marines don't loop in lockstep. */
  phase: number;
};

export type BattleOverlayFx = ReturnType<typeof createPopupMarineOverlayFx>;

const buildMaterial = (): MeshStandardMaterial =>
  // vertexColors:true multiplies the per-region greyscale painted by
  // bake-popup-marine-titan-model.py's paint pass (bright armor plates on
  // shoulders/chest, mid-tone torso and upper limbs, dark under-suit on
  // forearms/shins, near-black helmet, gloves, pistol and boots) against
  // both this material's own .color (set per-marine per-frame below — the
  // attacker/defender tint, replacing InstancedMesh.setColorAt now that
  // each marine has its own material) and the scene's real lighting.
  //
  // That paint is deliberately greyscale, never hued: every value is
  // literally "how much team color does this part show", so the squad stays
  // readable as blue-vs-red at gameplay zoom instead of the kit's own colors
  // competing with the side tint.
  new MeshStandardMaterial({ color: "#ffffff", vertexColors: true, roughness: 0.4, metalness: 0.4 });

export function createPopupMarineOverlayFx(scene: Scene) {
  const flashFx = createFlashMesh(scene, FLASH_SIZE, MAX_MARINES * 2);
  const flashMesh = flashFx.mesh;
  const shots = createShotRenderer(scene, MARINE_MODEL_SCALE, MAX_BOLTS);

  let disposed = false;

  const makeSlot = (template: PopupMarineTemplate, index: number): MarineSlot => {
    const root = cloneSkinned(template.root) as Object3D;
    const material = buildMaterial();
    const mesh = firstSkinnedMesh(root);
    mesh.material = material;
    mesh.frustumCulled = false;
    mesh.renderOrder = 37;
    root.visible = false;
    const mixer = new AnimationMixer(root);
    const actionFor = (clipName: string): AnimationAction => {
      const action = mixer.clipAction(template.clips.get(clipName)!);
      action.play(); // enabled here; per-frame weights below pick the live one
      action.enabled = false;
      return action;
    };
    const actions: Record<MarineStance, AnimationAction> = {
      run: actionFor(MARINE_CLIP_NAMES.run),
      stand: actionFor(MARINE_CLIP_NAMES.stand),
      kneel: actionFor(MARINE_CLIP_NAMES.kneel)
    };
    scene.add(root);
    return {
      root,
      material,
      mixer,
      actions,
      handBone: root.getObjectByName(HAND_BONE_NAME),
      // Spread the loop phase across the squad so a firing line doesn't
      // breathe/step in perfect unison.
      phase: (index % MARINES_PER_SIDE) * 0.37
    };
  };

  let attackerPool: MarineSlot[] = [];
  let defenderPool: MarineSlot[] = [];

  const disposeSlot = (slot: MarineSlot): void => {
    slot.mixer.stopAllAction();
    slot.mixer.uncacheRoot(slot.root);
    scene.remove(slot.root);
    slot.root.traverse((child) => {
      if (child instanceof SkinnedMesh) child.geometry.dispose();
    });
    slot.material.dispose();
  };

  loadPopupMarineTemplate()
    .then((template) => {
      if (disposed) return;
      attackerPool = Array.from({ length: MAX_MARINES }, (_, i) => makeSlot(template, i));
      defenderPool = Array.from({ length: MAX_MARINES }, (_, i) => makeSlot(template, i));
    })
    .catch((err: unknown) => {
      // Nothing renders rather than crashing the whole 3D map: the overlay's
      // pools simply stay empty, so a battle shows its tile highlight with no
      // marines instead of taking down the renderer.
      console.error("popup-marine model failed to load; battle marines will not render", err);
    });

  const tmpColor = new Color();
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
  };

  /** Drives this marine's clip selection. Clip TIME is derived straight from
   * nowMs rather than accumulated frame deltas, so a scrub or a mid-siege
   * rejoin lands on the same frame of the same loop instead of wherever a
   * stateful playhead happened to drift to — the same
   * pure-function-of-the-clock rule the rest of this overlay follows. */
  const playStance = (slot: MarineSlot, stance: MarineStance, nowMs: number): void => {
    for (const name of ["run", "stand", "kneel"] as const) {
      const action = slot.actions[name];
      const live = name === stance;
      action.enabled = live;
      action.setEffectiveWeight(live ? 1 : 0);
      if (!live) continue;
      const duration = action.getClip().duration;
      action.time = duration > 0 ? (nowMs * 0.001 + slot.phase) % duration : 0;
    }
    slot.mixer.update(0);
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
    playStance(slot, pose.stance, nowMs);
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
    skirmishes: BattleOverlaySkirmishEntry[] = []
  ): void => {
    if (battles.length === 0 && skirmishes.length === 0) { clear(); return; }

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
          const pose = computeBattlePose(b, side, i, nowMs, entryLocalX, entryLocalZ, perpX, perpZ, fwdX, fwdZ);
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
          const pose = computeSkirmishPose(b, side, i, nowMs, entryLocalX, entryLocalZ, perpX, perpZ, fwdX, fwdZ);
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

    flashFx.commit(flashWrite);
    shots.commit();
  };

  const dispose = (): void => {
    disposed = true;
    flashFx.dispose();
    shots.dispose();
    for (const slot of attackerPool) disposeSlot(slot);
    for (const slot of defenderPool) disposeSlot(slot);
    attackerPool = [];
    defenderPool = [];
  };

  return { tick, clear, dispose };
}
