// The pooled InstancedMeshes the pop-up-marine overlay draws its
// non-character effects with: muzzle flashes, laser bolts, and impact
// sparks. Split out of popup-marine-overlay-fx.ts (which was near the repo's
// 500-line cap) — each of these is the same shape of object, so the
// create/commit/dispose boilerplate is worth owning in one place.
//
// Every mesh here is written from index 0 each frame and its `count` is set
// to however many instances that frame actually used, so an effect that
// stops (nobody firing) leaves nothing on screen without needing per-instance
// clearing. frustumCulled is off because the instances move far outside the
// bounding volume three.js computes once at construction.
import { AdditiveBlending, BoxGeometry, ConeGeometry, InstancedMesh, MeshBasicMaterial } from "three";
import type { BufferGeometry, Material, Scene } from "three";

export type EffectMesh = {
  mesh: InstancedMesh;
  /** Publishes `count` instances' matrices (and colors, if the mesh uses
   * them) to the GPU. Call once per frame after writing. */
  commit: (count: number) => void;
  dispose: () => void;
};

const createEffectMesh = (
  scene: Scene,
  geometry: BufferGeometry,
  material: Material,
  capacity: number,
  renderOrder: number
): EffectMesh => {
  const mesh = new InstancedMesh(geometry, material, capacity);
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.renderOrder = renderOrder;
  scene.add(mesh);
  return {
    mesh,
    commit: (count) => {
      mesh.count = count;
      mesh.instanceMatrix.clearUpdateRanges();
      mesh.instanceMatrix.addUpdateRange(0, count * 16);
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
    dispose: () => {
      scene.remove(mesh);
      geometry.dispose();
      material.dispose();
    }
  };
};

/** Muzzle flash: a short cone at the pistol muzzle, scaled by flash intensity. */
export const createFlashMesh = (scene: Scene, size: number, capacity: number): EffectMesh =>
  createEffectMesh(
    scene,
    new ConeGeometry(size, size * 1.6, 5),
    new MeshBasicMaterial({ toneMapped: false, color: "#fff3b0", transparent: true, depthWrite: false }),
    capacity,
    37
  );

/** Laser bolt: a unit-length bar along +Z, rotated to its travel direction
 * and stretched to the streak length by the caller. */
export const createBoltMesh = (scene: Scene, width: number, capacity: number): EffectMesh =>
  createEffectMesh(
    scene,
    new BoxGeometry(width, width, 1),
    new MeshBasicMaterial({ toneMapped: false, transparent: true, depthWrite: false, opacity: 0.95 }),
    capacity,
    38
  );

/** Impact spark: a tiny cube shard thrown off the point a bolt lands on.
 *
 * AdditiveBlending is what makes a cluster of these read as a hot flash of
 * light rather than a handful of solid boxes, and it is also how a shard
 * FADES: additive blending makes a darker color a dimmer one, so the caller
 * fades a shard by scaling its instance color toward black rather than by
 * animating material opacity (which is per-material, and these all share
 * one). */
export const createSparkMesh = (scene: Scene, size: number, capacity: number): EffectMesh =>
  createEffectMesh(
    scene,
    new BoxGeometry(size, size, size),
    new MeshBasicMaterial({ toneMapped: false, transparent: true, depthWrite: false, blending: AdditiveBlending }),
    capacity,
    39
  );
