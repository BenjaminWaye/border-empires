import { AnimationMixer, type AnimationAction, type MeshStandardMaterial, type Object3D } from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { firstSkinnedMesh, type PopupMarineTemplate } from "../client-map-3d-popup-marine/popup-marine-asset.js";
import { createMarineMaterial } from "../client-map-3d-popup-marine/popup-marine-material.js";
import { MARINE_MODEL_SCALE } from "../client-map-3d-popup-marine/popup-marine-timeline.js";
import { SALVAGE_PACE, SALVAGE_RAMP_FOOT_DY, salvageMarcherAt, type SalvageMarcherTarget } from "./client-salvage-delivery-fx.js";

// The Ancillaries the Court delivers, in true 3D: the game's own soldier --
// the skinned battle marine (popup-marine-asset.ts) the battle and muster-march
// overlays use -- tinted in the House's colour and playing its PistolWalk clip,
// the same marching walk as a mustered company. Clip time is derived from the
// delivery's age, not accumulated frame deltas, so a late start or a rejoin
// samples the same pose.

const WALK_CLIP_NAME = "PistolWalk";
/** Spread the stride phase so the column doesn't walk in lockstep. */
const PHASE_STEP = 0.31;

type Ancillary = {
  readonly root: Object3D;
  readonly material: MeshStandardMaterial;
  readonly mixer: AnimationMixer;
  readonly walk: AnimationAction | undefined;
};

export type SalvageAncillaryColumn = {
  readonly update: (ageMs: number) => void;
  readonly dispose: () => void;
};

/**
 * One marine per target, added to `parent` (the delivery's group, at the
 * Works' tile centre and ground height). `surfaceDeltas` are each target's
 * ground height relative to the Works, so the column follows the land.
 */
export const createSalvageAncillaryColumn = (
  parent: Object3D,
  template: PopupMarineTemplate,
  color: string,
  targets: readonly SalvageMarcherTarget[],
  surfaceDeltas: readonly number[]
): SalvageAncillaryColumn => {
  const clip = template.clips.get(WALK_CLIP_NAME);
  const column: Ancillary[] = targets.map(() => {
    const root = cloneSkinned(template.root) as Object3D;
    const material = createMarineMaterial(false);
    material.color.set(color);
    material.transparent = true;
    const mesh = firstSkinnedMesh(root);
    mesh.material = material;
    mesh.frustumCulled = false;
    root.visible = false;
    parent.add(root);
    const mixer = new AnimationMixer(root);
    const walk = clip ? mixer.clipAction(clip) : undefined;
    walk?.play();
    return { root, material, mixer, walk };
  });

  const update = (ageMs: number): void => {
    column.forEach((ancillary, i) => {
      const m = salvageMarcherAt(targets[i]!, i, ageMs);
      ancillary.root.visible = m.visible && m.alpha > 0.01;
      if (!ancillary.root.visible) return;
      // On the ramp the column walks straight out of the nose (+Z); on the ground, toward its target.
      const onRamp = m.groundProgress === 0 && m.dy < SALVAGE_RAMP_FOOT_DY - 1e-6;
      const target = targets[i]!;
      const yaw = onRamp ? 0 : Math.atan2(target.dx, target.dy - SALVAGE_RAMP_FOOT_DY);
      // The marine's own walk carries the step; drop the shared timeline's bob.
      const lift = onRamp ? m.lift : 0;
      ancillary.root.position.set(m.dx, lift + (surfaceDeltas[i] ?? 0) * m.groundProgress, m.dy);
      ancillary.root.rotation.set(0, yaw, 0);
      ancillary.root.scale.setScalar(MARINE_MODEL_SCALE * m.scale);
      ancillary.material.opacity = m.alpha;
      if (ancillary.walk) {
        const duration = ancillary.walk.getClip().duration;
        // The column walks at the paced timeline's speed, so the stride slows with it (no foot slide).
        ancillary.walk.time = duration > 0 ? ((ageMs * 0.001) / SALVAGE_PACE + i * PHASE_STEP) % duration : 0;
      }
      ancillary.mixer.update(0);
    });
  };

  const dispose = (): void => {
    for (const ancillary of column) {
      ancillary.mixer.stopAllAction();
      ancillary.mixer.uncacheRoot(ancillary.root);
      parent.remove(ancillary.root);
      // Geometry is shared with the cached template (SkeletonUtils.clone); only the material is ours.
      ancillary.material.dispose();
    }
  };

  return { update, dispose };
};
