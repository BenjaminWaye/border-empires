// One pooled pop-up marine: a cloned skinned model root with its own team-
// tinted material, occlusion silhouette and AnimationMixer. Split out of
// popup-marine-overlay-fx.ts (500-line cap) when the capture-hold garrison
// was added -- the overlay only places and poses these slots each frame.
import { AnimationMixer, MeshStandardMaterial, Object3D, Scene, SkinnedMesh, type AnimationAction, type Texture } from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { MARINE_CLIP_NAMES, MARINE_MELEE_CLIP, firstSkinnedMesh, type PopupMarineTemplate } from "./popup-marine-asset.js";
import { attachOcclusionSilhouette, MARINE_RENDER_ORDER, type MarineSilhouette } from "./popup-marine-occlusion-silhouette.js";
import { MARINES_PER_SIDE, type MarineStance } from "./popup-marine-timeline.js";
import type { MarineModelKey } from "./popup-marine-gear.js";
import { applySurfaceMask } from "./popup-marine-metal-material.js";
import { applyBuildingEnvMap } from "../client-map-3d-building-envmap/client-map-3d-building-envmap.js";

// Rig bone the muzzle flash is pinned to: the standard marine's pistol hand,
// but the titanium war-walker's LEFT hand -- its gatling arm (the right arm
// carries the buzz-saw claw; see bake-popup-marine-titanium-model.py).
const HAND_BONE_BY_MODEL: Record<MarineModelKey, string> = {
  standard: "RightHand",
  titanium: "LeftHand"
};

export type MarineSlot = {
  /** Whole cloned model root — the asset carries its scale on its own root
   * node, so the group (not the bare SkinnedMesh) is what gets placed. */
  root: Object3D;
  material: MeshStandardMaterial;
  /** Team-tinted x-ray pass, seen only where something hides the marine. */
  silhouette: MarineSilhouette;
  mixer: AnimationMixer;
  actions: Record<Exclude<MarineStance, "melee">, AnimationAction> & { melee?: AnimationAction };
  /** Bone the muzzle flash hangs off, if the rig exposes a hand. */
  handBone: Object3D | undefined;
  /** Phase offset (seconds) so marines don't loop in lockstep. */
  phase: number;
};

// The titanium war-walker's base finish is its faction PAINT (panels,
// graphite joints); its bare titanium comes from the baked surface mask
// instead (popup-marine-metal-material.ts), which needs an environment map
// to reflect -- metal with nothing to reflect renders nearly black.
const FINISH_BY_MODEL: Record<MarineModelKey, { roughness: number; metalness: number }> = {
  standard: { roughness: 0.4, metalness: 0.4 },
  titanium: { roughness: 0.5, metalness: 0.2 }
};
const SURFACE_MASKED_MODELS: ReadonlySet<MarineModelKey> = new Set(["titanium"]);

const buildMaterial = (model: MarineModelKey, envMap: Texture | undefined): MeshStandardMaterial => {
  // vertexColors:true multiplies the per-region greyscale painted by
  // bake-popup-marine-titan-model.py's paint pass (bright armor plates on
  // shoulders/chest, mid-tone torso and upper limbs, dark under-suit on
  // forearms/shins, near-black helmet, gloves, pistol and boots) against
  // both this material's own .color (set per-marine per-frame by the
  // overlay — the attacker/defender tint, replacing InstancedMesh.setColorAt
  // now that each marine has its own material) and the scene's real lighting.
  //
  // That paint is deliberately greyscale, never hued: every value is
  // literally "how much team color does this part show", so the squad stays
  // readable as blue-vs-red at gameplay zoom instead of the kit's own colors
  // competing with the side tint.
  const material = new MeshStandardMaterial({ color: "#ffffff", vertexColors: true, ...FINISH_BY_MODEL[model] });
  if (SURFACE_MASKED_MODELS.has(model)) {
    applySurfaceMask(material);
    applyBuildingEnvMap(material, envMap);
  }
  return material;
};

export const createMarineSlot = (
  scene: Scene,
  template: PopupMarineTemplate,
  index: number,
  model: MarineModelKey = "standard",
  envMap?: Texture
): MarineSlot => {
  const root = cloneSkinned(template.root) as Object3D;
  const material = buildMaterial(model, envMap);
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
  const actions: MarineSlot["actions"] = {
    run: actionFor(MARINE_CLIP_NAMES.run),
    stand: actionFor(MARINE_CLIP_NAMES.stand),
    kneel: actionFor(MARINE_CLIP_NAMES.kneel),
    ...(template.clips.has(MARINE_MELEE_CLIP) ? { melee: actionFor(MARINE_MELEE_CLIP) } : {})
  };
  scene.add(root);
  return {
    root,
    material,
    silhouette,
    mixer,
    actions,
    handBone: root.getObjectByName(HAND_BONE_BY_MODEL[model]),
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
  // A model without a melee clip fights from its standing clip.
  const playing = stance === "melee" && !slot.actions.melee ? "stand" : stance;
  for (const name of ["run", "stand", "kneel", "melee"] as const) {
    const action = slot.actions[name];
    if (!action) continue;
    const live = name === playing;
    action.enabled = live;
    action.setEffectiveWeight(live ? 1 : 0);
    if (!live) continue;
    const duration = action.getClip().duration;
    action.time = duration > 0 ? (nowMs * 0.001 + slot.phase) % duration : 0;
  }
  slot.mixer.update(0);
};
