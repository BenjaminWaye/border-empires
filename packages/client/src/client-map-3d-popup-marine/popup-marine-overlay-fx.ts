// Renders every concurrently active combat as a small squad of low-poly
// space-marine soldiers per side (MARINES_PER_SIDE, see popup-marine-
// timeline.ts) that rush cover at the target tile's edge, advance to a
// firing line, pop up to aim and fire in bursts (with muzzle flashes), and
// finish by either pushing through (winner) or ducking/scattering (loser) —
// driven entirely by server-resolved outcomes, same as the dot-swarm system
// this replaces. See PopupMarineOverlayFx.stories.ts and
// client-battle-overlay.ts for how state.activeBattles gets populated. The
// animation never decides anything — attackerWon is already known before the
// first frame renders; this module only stages the reveal.
//
// Rendering approach: a pool of up to MAX_MARINES individual SkinnedMesh
// objects per side (added/removed from the scene exactly like the marine
// "slots" this system already allocates/frees per battle/skirmish), each
// posed every frame via popup-marine-pose.ts's procedural bone posing —
// replacing the previous single InstancedMesh-of-one-rigid-transform-per-
// marine approach, which had no way to move a limb independently of the
// whole body. This trades "one draw call for all marines on a side" for
// "one draw call per marine" (up to ~160 marine slots total,
// MAX_CONCURRENT_BATTLES * MARINES_PER_SIDE * 2 sides) — an acceptable,
// ordinary cost for a modern WebGL renderer at this count; muzzle-flash
// stays InstancedMesh since it has no bones to animate.
//
// True-3D renderer only (see client-map-3d/client-map-3d.ts's
// isTrue3DRendererActive() gate) — the 2D canvas renderer has no equivalent
// animation and never did; see AGENTS.md's renderer-parity note and the PR
// description for why that's a documented scope decision, not a
// regression.
import {
  Color,
  ConeGeometry,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  Scene,
  SkinnedMesh,
  Vector3
} from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { loadPopupMarineTemplate } from "./popup-marine-asset.js";
import { buildPlaceholderMarineTemplate, findMarineBones, poseMarineBones, type MarineBones } from "./popup-marine-pose.js";
import {
  MARINES_PER_SIDE,
  computeBattlePose,
  computeSkirmishPose,
  clampLocal,
  type BattleOverlayRenderEntry,
  type BattleOverlaySkirmishEntry,
  type MarinePose
} from "./popup-marine-timeline.js";

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
const FLASH_SIZE = 0.006;
// Small forward offset from the armR_lower ("forearm/hand") bone's own
// origin to the rifle's muzzle tip, in that bone's local space — see
// bake-popup-marine-model.mjs's rifle placement. Because the arm now really
// moves (aim raise, fire recoil), the flash is positioned from the bone's
// live world matrix each frame (see writeFlash below) rather than a fixed
// whole-body offset, so it stays attached to the rifle instead of floating.
const MUZZLE_LOCAL_OFFSET = new Vector3(0, 0, 0.017);
const CROUCH_DROP = 0.022; // how far a fully-crouched marine sinks into cover
const FALL_DROP = 0.018;
const UP_AXIS = new Vector3(0, 1, 0);
const FWD_AXIS = new Vector3(0, 0, 1);

type MarineSlot = {
  mesh: SkinnedMesh;
  material: MeshStandardMaterial;
  bones: MarineBones;
};

export type BattleOverlayFx = ReturnType<typeof createPopupMarineOverlayFx>;

const buildMaterial = (): MeshStandardMaterial =>
  // vertexColors:true multiplies the baked per-part tint from
  // bake-popup-marine-model.mjs (team-colored armor near white, joints mid
  // grey, helmet/rifle/arms near black) against both this material's own
  // .color (set per-marine per-frame below — the attacker/defender tint,
  // replacing InstancedMesh.setColorAt now that each marine has its own
  // material) and the scene's real lighting.
  new MeshStandardMaterial({ color: "#ffffff", vertexColors: true, roughness: 0.4, metalness: 0.4 });

export function createPopupMarineOverlayFx(scene: Scene) {
  const flashGeom = new ConeGeometry(FLASH_SIZE, FLASH_SIZE * 1.6, 5);
  const flashMat = new MeshBasicMaterial({ toneMapped: false, color: "#fff3b0", transparent: true, depthWrite: false });
  const flashMesh = new InstancedMesh(flashGeom, flashMat, MAX_MARINES * 2);
  flashMesh.frustumCulled = false;
  flashMesh.count = 0;
  flashMesh.renderOrder = 37;
  scene.add(flashMesh);

  let disposed = false;

  const makeSlot = (template: SkinnedMesh): MarineSlot => {
    const mesh = cloneSkinned(template) as SkinnedMesh;
    const material = buildMaterial();
    mesh.material = material;
    mesh.frustumCulled = false;
    mesh.renderOrder = 37;
    mesh.visible = false;
    const bones = findMarineBones(mesh);
    scene.add(mesh);
    return { mesh, material, bones };
  };

  // Populated synchronously (placeholder skeleton) so the pool has
  // something posable to render from frame one; each slot's mesh/material
  // get swapped in place once the real baked model resolves, same as the
  // old InstancedMesh geometry hot-swap.
  let attackerPool: MarineSlot[] = Array.from({ length: MAX_MARINES }, () => makeSlot(buildPlaceholderMarineTemplate()));
  let defenderPool: MarineSlot[] = Array.from({ length: MAX_MARINES }, () => makeSlot(buildPlaceholderMarineTemplate()));

  const disposeSlot = (slot: MarineSlot): void => {
    scene.remove(slot.mesh);
    slot.mesh.geometry.dispose();
    slot.material.dispose();
  };

  loadPopupMarineTemplate()
    .then((template: SkinnedMesh) => {
      if (disposed) return;
      const nextAttacker = attackerPool.map(() => makeSlot(template));
      const nextDefender = defenderPool.map(() => makeSlot(template));
      for (const slot of attackerPool) disposeSlot(slot);
      for (const slot of defenderPool) disposeSlot(slot);
      attackerPool = nextAttacker;
      defenderPool = nextDefender;
    })
    .catch((err: unknown) => {
      // Placeholder skinned boxes keep rendering — a failed model fetch
      // degrades to "small tinted blocks with animated limbs pop up and
      // fire", not a crash or a blank tile.
      console.error("popup-marine model failed to load; using placeholder geometry", err);
    });

  const tmpColor = new Color();
  const tmpQuat = new Quaternion();
  const fallQuat = new Quaternion();
  const flashPos = new Vector3();
  const flashM = new Matrix4();
  const flashQuat = new Quaternion();
  const flashScale = new Vector3();

  const clear = (): void => {
    for (const slot of attackerPool) slot.mesh.visible = false;
    for (const slot of defenderPool) slot.mesh.visible = false;
    flashMesh.count = 0;
  };

  const writeMarine = (
    slot: MarineSlot,
    color: string,
    tileX: number,
    tileY: number,
    tileZ: number,
    pose: MarinePose
  ): void => {
    const yOffset = -CROUCH_DROP * (1 - pose.crouchT) - FALL_DROP * pose.fallT;
    slot.mesh.visible = pose.scale > 0;
    slot.mesh.position.set(tileX + clampLocal(pose.localX), tileY + MARINE_Y_OFFSET + yOffset, tileZ + clampLocal(pose.localZ));
    tmpQuat.setFromAxisAngle(UP_AXIS, pose.yaw);
    if (pose.fallT > 0) {
      fallQuat.setFromAxisAngle(FWD_AXIS, (Math.PI / 2) * pose.fallT);
      tmpQuat.multiply(fallQuat);
    }
    slot.mesh.quaternion.copy(tmpQuat);
    slot.mesh.scale.setScalar(Math.max(0, pose.scale));
    slot.material.color.set(color);
    poseMarineBones(slot.bones, pose);
    slot.mesh.updateMatrixWorld(true);
  };

  const writeFlash = (writeIndex: number, slot: MarineSlot, pose: MarinePose): number => {
    if (pose.flash <= 0 || !slot.mesh.visible) return writeIndex;
    // Read the rifle hand bone's live world matrix so the flash tracks the
    // arm's actual aim/recoil pose instead of a fixed whole-body offset.
    flashPos.copy(MUZZLE_LOCAL_OFFSET).applyMatrix4(slot.bones.armR_lower.matrixWorld);
    flashQuat.setFromAxisAngle(UP_AXIS, slot.mesh.rotation.y);
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

    for (const slot of attackerPool) slot.mesh.visible = false;
    for (const slot of defenderPool) slot.mesh.visible = false;

    let atkWrite = 0;
    let defWrite = 0;
    let flashWrite = 0;
    let slotCount = 0;

    const writeOne = (pool: MarineSlot[], writeIndex: number, color: string, tileX: number, tileY: number, tileZ: number, pose: MarinePose): void => {
      const slot = pool[writeIndex];
      if (!slot) return;
      writeMarine(slot, color, tileX, tileY, tileZ, pose);
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

        for (let i = 0; i < MARINES_PER_SIDE; i++) {
          const pose = computeBattlePose(b, side, i, nowMs, entryLocalX, entryLocalZ, perpX, perpZ, fwdX, fwdZ);
          const writeIndex = isAttacker ? atkWrite : defWrite;
          writeOne(pool, writeIndex, color, tileX, tileY, tileZ, pose);
          if (isAttacker) atkWrite++; else defWrite++;
        }
      }
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

        for (let i = 0; i < MARINES_PER_SIDE; i++) {
          const pose = computeSkirmishPose(b, side, i, nowMs, entryLocalX, entryLocalZ, perpX, perpZ, fwdX, fwdZ);
          const writeIndex = isAttacker ? atkWrite : defWrite;
          writeOne(pool, writeIndex, color, tileX, tileY, tileZ, pose);
          if (isAttacker) atkWrite++; else defWrite++;
        }
      }
    }

    flashMesh.count = flashWrite;
    flashMesh.instanceMatrix.clearUpdateRanges();
    flashMesh.instanceMatrix.addUpdateRange(0, flashMesh.count * 16);
    flashMesh.instanceMatrix.needsUpdate = true;
  };

  const dispose = (): void => {
    disposed = true;
    scene.remove(flashMesh);
    flashGeom.dispose();
    flashMat.dispose();
    for (const slot of attackerPool) disposeSlot(slot);
    for (const slot of defenderPool) disposeSlot(slot);
    attackerPool = [];
    defenderPool = [];
  };

  return { tick, clear, dispose };
}
