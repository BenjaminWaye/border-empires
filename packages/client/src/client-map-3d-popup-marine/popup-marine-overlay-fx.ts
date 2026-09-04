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
// True-3D renderer only (see client-map-3d/client-map-3d.ts's
// isTrue3DRendererActive() gate) — the 2D canvas renderer has no equivalent
// animation and never did; see AGENTS.md's renderer-parity note and the PR
// description for why that's a documented scope decision, not a
// regression.
import { BoxGeometry, Color, ConeGeometry, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, Scene, Vector3 } from "three";
import type { BufferGeometry } from "three";
import { loadPopupMarineGeometry } from "./popup-marine-asset.js";
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
// Placeholder geometry drawn until the baked .glb resolves (first frames of
// the very first battle on a fresh page load only — cached thereafter).
// Roughly marine-body-sized so the swap-in doesn't pop wildly in scale.
const PLACEHOLDER_GEOM = new BoxGeometry(0.22, 0.56, 0.14);
const FLASH_SIZE = 0.05;
// Must track the rifle geometry baked in bake-popup-marine-model.mjs — the
// merged model's muzzle tip sits at local z≈0.44, y≈0.34 (rifle held at
// chest height, extending forward from the marine's origin). Keeping these
// in sync is what makes the muzzle flash appear to come from the rifle tip
// instead of floating disconnected from the model.
const MUZZLE_FWD_OFFSET = 0.42;
const MUZZLE_Y = 0.34;
const CROUCH_DROP = 0.22; // how far a fully-crouched marine sinks into cover
const FALL_DROP = 0.18;
const UP_AXIS = new Vector3(0, 1, 0);
const FWD_AXIS = new Vector3(0, 0, 1);

export type BattleOverlayFx = ReturnType<typeof createPopupMarineOverlayFx>;

export function createPopupMarineOverlayFx(scene: Scene) {
  const attackerMat = new MeshBasicMaterial({ toneMapped: false, color: "#ffffff" });
  const defenderMat = new MeshBasicMaterial({ toneMapped: false, color: "#ffffff" });
  const flashGeom = new ConeGeometry(FLASH_SIZE, FLASH_SIZE * 1.6, 5);
  const flashMat = new MeshBasicMaterial({ toneMapped: false, color: "#fff3b0", transparent: true, depthWrite: false });

  const attackerMesh: InstancedMesh<BufferGeometry, MeshBasicMaterial> = new InstancedMesh(PLACEHOLDER_GEOM, attackerMat, MAX_MARINES);
  const defenderMesh: InstancedMesh<BufferGeometry, MeshBasicMaterial> = new InstancedMesh(PLACEHOLDER_GEOM, defenderMat, MAX_MARINES);
  const flashMesh = new InstancedMesh(flashGeom, flashMat, MAX_MARINES * 2);

  let disposed = false;
  for (const mesh of [attackerMesh, defenderMesh, flashMesh]) {
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.renderOrder = 37;
    scene.add(mesh);
  }

  // Swap the placeholder box geometry for the real baked model once it
  // loads. attackerMesh/defenderMesh keep their identity (and their current
  // instance data) across the swap — only .geometry changes.
  loadPopupMarineGeometry()
    .then((geom: BufferGeometry) => {
      if (disposed) return;
      attackerMesh.geometry = geom;
      defenderMesh.geometry = geom;
    })
    .catch((err: unknown) => {
      // Placeholder boxes keep rendering — a failed model fetch degrades to
      // "small tinted blocks pop up and fire", not a crash or a blank tile.
      console.error("popup-marine model failed to load; using placeholder geometry", err);
    });

  const tmpColor = new Color();
  const tmpM = new Matrix4();
  const tmpPos = new Vector3();
  const tmpScale = new Vector3();
  const tmpQuat = new Quaternion();
  const fallQuat = new Quaternion();
  const flashQuat = new Quaternion();

  const clear = (): void => {
    attackerMesh.count = 0;
    defenderMesh.count = 0;
    flashMesh.count = 0;
  };

  const writeMarine = (
    mesh: InstancedMesh,
    writeIndex: number,
    color: string,
    tileX: number,
    tileY: number,
    tileZ: number,
    pose: MarinePose
  ): void => {
    const yOffset = -CROUCH_DROP * (1 - pose.crouchT) - FALL_DROP * pose.fallT;
    tmpPos.set(tileX + clampLocal(pose.localX), tileY + MARINE_Y_OFFSET + yOffset, tileZ + clampLocal(pose.localZ));
    tmpQuat.setFromAxisAngle(UP_AXIS, pose.yaw);
    if (pose.fallT > 0) {
      fallQuat.setFromAxisAngle(FWD_AXIS, (Math.PI / 2) * pose.fallT);
      tmpQuat.multiply(fallQuat);
    }
    tmpScale.setScalar(Math.max(0, pose.scale));
    tmpM.compose(tmpPos, tmpQuat, tmpScale);
    mesh.setMatrixAt(writeIndex, tmpM);
    mesh.setColorAt(writeIndex, tmpColor.set(color));
  };

  const writeFlash = (
    writeIndex: number,
    tileX: number,
    tileY: number,
    tileZ: number,
    pose: MarinePose,
    fwdX: number,
    fwdZ: number
  ): number => {
    if (pose.flash <= 0) return writeIndex;
    const muzzleX = pose.localX + fwdX * MUZZLE_FWD_OFFSET;
    const muzzleZ = pose.localZ + fwdZ * MUZZLE_FWD_OFFSET;
    tmpPos.set(tileX + clampLocal(muzzleX), tileY + MARINE_Y_OFFSET + MUZZLE_Y, tileZ + clampLocal(muzzleZ));
    flashQuat.setFromAxisAngle(UP_AXIS, pose.yaw);
    tmpScale.setScalar(pose.flash);
    tmpM.compose(tmpPos, flashQuat, tmpScale);
    flashMesh.setMatrixAt(writeIndex, tmpM);
    return writeIndex + 1;
  };

  const tick = (
    nowMs: number,
    battles: BattleOverlayRenderEntry[],
    skirmishes: BattleOverlaySkirmishEntry[] = []
  ): void => {
    if (battles.length === 0 && skirmishes.length === 0) { clear(); return; }

    let atkWrite = 0;
    let defWrite = 0;
    let flashWrite = 0;
    let slot = 0;

    for (; slot < battles.length && slot < MAX_CONCURRENT_BATTLES; slot++) {
      const b = battles[slot]!;
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
        const mesh = isAttacker ? attackerMesh : defenderMesh;
        const color = isAttacker ? b.attackerColor : b.defenderColor;

        for (let i = 0; i < MARINES_PER_SIDE; i++) {
          const pose = computeBattlePose(b, side, i, nowMs, entryLocalX, entryLocalZ, perpX, perpZ, fwdX, fwdZ);
          const writeIndex = isAttacker ? atkWrite : defWrite;
          writeMarine(mesh, writeIndex, color, tileX, tileY, tileZ, pose);
          if (isAttacker) atkWrite++; else defWrite++;
          flashWrite = writeFlash(flashWrite, tileX, tileY, tileZ, pose, fwdX, fwdZ);
        }
      }
    }

    for (let s = 0; s < skirmishes.length && slot < MAX_CONCURRENT_BATTLES; s++, slot++) {
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
        const mesh = isAttacker ? attackerMesh : defenderMesh;
        const color = isAttacker ? b.attackerColor : b.defenderColor;

        for (let i = 0; i < MARINES_PER_SIDE; i++) {
          const pose = computeSkirmishPose(b, side, i, nowMs, entryLocalX, entryLocalZ, perpX, perpZ, fwdX, fwdZ);
          const writeIndex = isAttacker ? atkWrite : defWrite;
          writeMarine(mesh, writeIndex, color, tileX, tileY, tileZ, pose);
          if (isAttacker) atkWrite++; else defWrite++;
          flashWrite = writeFlash(flashWrite, tileX, tileY, tileZ, pose, fwdX, fwdZ);
        }
      }
    }

    attackerMesh.count = atkWrite;
    defenderMesh.count = defWrite;
    flashMesh.count = flashWrite;
    for (const mesh of [attackerMesh, defenderMesh, flashMesh]) {
      mesh.instanceMatrix.clearUpdateRanges();
      mesh.instanceMatrix.addUpdateRange(0, mesh.count * 16);
      mesh.instanceMatrix.needsUpdate = true;
    }
    if (attackerMesh.instanceColor) {
      attackerMesh.instanceColor.clearUpdateRanges();
      attackerMesh.instanceColor.addUpdateRange(0, attackerMesh.count * 3);
      attackerMesh.instanceColor.needsUpdate = true;
    }
    if (defenderMesh.instanceColor) {
      defenderMesh.instanceColor.clearUpdateRanges();
      defenderMesh.instanceColor.addUpdateRange(0, defenderMesh.count * 3);
      defenderMesh.instanceColor.needsUpdate = true;
    }
  };

  const dispose = (): void => {
    disposed = true;
    scene.remove(attackerMesh, defenderMesh, flashMesh);
    flashGeom.dispose();
    attackerMat.dispose();
    defenderMat.dispose();
    flashMat.dispose();
  };

  return { tick, clear, dispose };
}
