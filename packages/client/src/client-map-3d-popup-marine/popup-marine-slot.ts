// One pooled pop-up marine: a cloned skinned model root with its own team-
// tinted material, occlusion silhouette and AnimationMixer. Split out of
// popup-marine-overlay-fx.ts (500-line cap) when the capture-hold garrison
// was added -- the overlay only places and poses these slots each frame.
import { AnimationMixer, MeshStandardMaterial, Object3D, Scene, SkinnedMesh, type AnimationAction, type Texture } from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { MARINE_CLIP_NAMES, firstSkinnedMesh, type PopupMarineTemplate } from "./popup-marine-asset.js";
import { attachOcclusionSilhouette, MARINE_RENDER_ORDER, type MarineSilhouette } from "./popup-marine-occlusion-silhouette.js";
import { MARINES_PER_SIDE, type MarineStance } from "./popup-marine-timeline.js";
import type { MarineModelKey } from "./popup-marine-gear.js";
import { createMarineMaterial } from "./popup-marine-material.js";

// Rig bone the muzzle flash is pinned to (the Mixamo humanoid's pistol hand).
const HAND_BONE_NAME = "RightHand";

export type MarineSlot = {
  /** Whole cloned model root — the asset carries its scale on its own root
   * node, so the group (not the bare SkinnedMesh) is what gets placed. */
  root: Object3D;
  material: MeshStandardMaterial;
  /** Team-tinted x-ray pass, seen only where something hides the marine. */
  silhouette: MarineSilhouette;
  mixer: AnimationMixer;
  actions: Record<MarineStance, AnimationAction>;
  /** Bone the muzzle flash hangs off, if the rig exposes a hand. */
  handBone: Object3D | undefined;
  /** Phase offset (seconds) so marines don't loop in lockstep. */
  phase: number;
};

/** `model` is which soldier `template` is; `envMap` is what the heavy
 * armour's bare metal reflects (the shared building environment map; see
 * popup-marine-material.ts). */
export const createMarineSlot = (
  scene: Scene,
  template: PopupMarineTemplate,
  index: number,
  model: MarineModelKey = "standard",
  envMap?: Texture
): MarineSlot => {
  const root = cloneSkinned(template.root) as Object3D;
  const material = createMarineMaterial(model === "heavy", envMap);
  const mesh = firstSkinnedMesh(root);
  mesh.material = material;
  mesh.frustumCulled = false;
  mesh.renderOrder = MARINE_RENDER_ORDER;
  const silhouette = attachOcclusionSilhouette(mesh);
  root.visible = false;
  const mixer = new AnimationMixer(root);
  const actionFor = (clipName: string): AnimationAction => {
    const action = mixer.clipAction(template.clips.get(clipName)!);
    action.play(); // enabled here; per-frame weights in playMarineStance pick the live one
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
    silhouette,
    mixer,
    actions,
    handBone: root.getObjectByName(HAND_BONE_NAME),
    // Spread the loop phase across the squad so a firing line doesn't
    // breathe/step in perfect unison.
    phase: (index % MARINES_PER_SIDE) * 0.37
  };
};

export const disposeMarineSlot = (scene: Scene, slot: MarineSlot): void => {
  slot.mixer.stopAllAction();
  slot.mixer.uncacheRoot(slot.root);
  scene.remove(slot.root);
  slot.root.traverse((child) => {
    if (child instanceof SkinnedMesh) child.geometry.dispose();
  });
  slot.material.dispose();
  slot.silhouette.material.dispose();
};

/** Drives this marine's clip selection. Clip TIME is derived straight from
 * nowMs rather than accumulated frame deltas, so a scrub or a mid-siege
 * rejoin lands on the same frame of the same loop instead of wherever a
 * stateful playhead happened to drift to — the same
 * pure-function-of-the-clock rule the rest of the overlay follows. */
export const playMarineStance = (slot: MarineSlot, stance: MarineStance, nowMs: number): void => {
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
