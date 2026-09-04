// Bone-posing for the pop-up-marine SkinnedMesh model (see
// bake-popup-marine-model.mjs for the skeleton this drives: hips -> spine ->
// {armR_upper -> armR_lower, armL} and hips -> {legL, legR}).
//
// Poses are computed PROCEDURALLY every frame straight from the existing
// MarinePose fields (crouchT/fallT/flash) in popup-marine-timeline.ts,
// rather than played back from baked AnimationClips via AnimationMixer.
// That's a deliberate choice, not a shortcut: the FullAttackLifecycle
// Storybook story (and the real game, when a player scrubs/rejoins a
// battle mid-flight) can jump the render clock to an arbitrary absolute
// nowMs at any time — backwards as easily as forwards — and
// AnimationMixer's time-delta-accumulating playhead has no correct answer
// for "seek". A pure function of the current pose state does: every bone
// angle below is a direct function of crouchT/fallT/flash, so scrubbing to
// the same nowMs twice always produces the same pose, matching how the
// whole-body transform this replaces already worked.
import { Bone, BoxGeometry, MeshStandardMaterial, Object3D, Skeleton, SkinnedMesh, Uint16BufferAttribute, Float32BufferAttribute } from "three";
import type { BufferGeometry } from "three";
import type { MarinePose } from "./popup-marine-timeline.js";

export const MARINE_BONE_NAMES = ["hips", "spine", "armR_upper", "armR_lower", "armL", "legL", "legR"] as const;
export type MarineBoneName = (typeof MARINE_BONE_NAMES)[number];
export type MarineBones = Record<MarineBoneName, Bone>;

/** Looks up every named bone on a (possibly cloned) marine SkinnedMesh.
 * Throws if the model's skeleton doesn't carry the expected bone names —
 * a loud failure here means bake-popup-marine-model.mjs and this file have
 * drifted out of sync, not a silently-broken pose. */
export const findMarineBones = (root: Object3D): MarineBones => {
  const result = {} as MarineBones;
  for (const name of MARINE_BONE_NAMES) {
    const found = root.getObjectByName(name);
    if (!(found instanceof Bone)) throw new Error(`popup-marine model is missing bone "${name}"`);
    result[name] = found;
  }
  return result;
};

// Rest-pose leg/arm rotation constants (radians, all about local X — the
// axis that swings a limb forward/back relative to the marine's facing).
// Tuned by eye via the Storybook FullAttackLifecycle story (see the PR
// description for the before/after screenshots this was checked against).
const LEG_BEND = 0.85; // knee bend when crouched or collapsed
const SPINE_LEAN = 0.5; // torso lean-down while in cover
const ARM_DOWN = 1.3; // rifle lowered, arm hangs near vertical
const ARM_AIM = 0.15; // rifle raised roughly level, aiming
const ELBOW_AIM_BEND = 0.55; // forearm bend once aiming
const RECOIL_KICK = 0.4; // extra forearm kick on a fire pulse
const ARM_L_DOWN = 0.9;
const ARM_L_AIM = 0.25;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Poses one marine's bones for the current frame's MarinePose (already
 * computed by computeBattlePose/computeSkirmishPose). `up` (0..1) is how
 * "popped up out of cover and aiming" the marine is; `fall` (0..1) folds
 * the rig down for a casualty or a winner's post-firefight duck. */
export const poseMarineBones = (bones: MarineBones, pose: MarinePose): void => {
  const up = Math.max(0, Math.min(1, pose.crouchT));
  const fall = Math.max(0, Math.min(1, pose.fallT));
  const standing = up * (1 - fall);

  const kneeBend = lerp(LEG_BEND, 0, standing) + LEG_BEND * fall * 0.5;
  bones.legL.rotation.x = -kneeBend;
  bones.legR.rotation.x = -kneeBend;

  bones.spine.rotation.x = SPINE_LEAN * (1 - standing) + fall * 0.9;

  const armRUp = lerp(-ARM_DOWN, -ARM_AIM, standing);
  bones.armR_upper.rotation.x = armRUp - fall * 0.4;
  bones.armR_lower.rotation.x = -ELBOW_AIM_BEND * standing - pose.flash * RECOIL_KICK;

  bones.armL.rotation.x = lerp(-ARM_L_DOWN, -ARM_L_AIM, standing) - fall * 0.3;
};

const bindMeshToBones = (geom: BufferGeometry, boneIndex: number): BufferGeometry => {
  const position = geom.attributes.position;
  if (!position) throw new Error("placeholder marine geometry has no position attribute");
  const count = position.count;
  const skinIndex = new Uint16Array(count * 4);
  const skinWeight = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    skinIndex[i * 4] = boneIndex;
    skinWeight[i * 4] = 1;
  }
  geom.setAttribute("skinIndex", new Uint16BufferAttribute(skinIndex, 4));
  geom.setAttribute("skinWeight", new Float32BufferAttribute(skinWeight, 4));
  geom.setAttribute("color", new Float32BufferAttribute(new Float32Array(count * 3).fill(1), 3));
  return geom;
};

/** Builds a tiny synchronous placeholder SkinnedMesh carrying the same
 * MARINE_BONE_NAMES skeleton as the baked .glb, so the pool in
 * popup-marine-overlay-fx.ts has something posable to render from frame
 * one, before the real model's async fetch resolves (mirrors the old
 * placeholder-box behavior, just skinned now so pose code doesn't need a
 * separate no-op code path for "model not loaded yet"). */
export const buildPlaceholderMarineTemplate = (): SkinnedMesh => {
  const bones = {} as MarineBones;
  for (const name of MARINE_BONE_NAMES) {
    const bone = new Bone();
    bone.name = name;
    bones[name] = bone;
  }
  bones.spine.position.set(0, 0.02, 0);
  bones.hips.add(bones.spine);
  bones.armR_upper.position.set(0.0165, 0.016, 0.006);
  bones.spine.add(bones.armR_upper);
  bones.armR_lower.position.set(0, -0.002, 0.011);
  bones.armR_upper.add(bones.armR_lower);
  bones.armL.position.set(-0.0165, 0.016, 0.006);
  bones.spine.add(bones.armL);
  bones.legL.position.set(-0.0055, 0, 0);
  bones.hips.add(bones.legL);
  bones.legR.position.set(0.0055, 0, 0);
  bones.hips.add(bones.legR);

  const geom = bindMeshToBones(new BoxGeometry(0.022, 0.052, 0.014).translate(0, 0.026, 0), MARINE_BONE_NAMES.indexOf("hips"));
  const mat = new MeshStandardMaterial({ color: "#ffffff", vertexColors: true, roughness: 0.4, metalness: 0.4 });
  const mesh = new SkinnedMesh(geom, mat);
  mesh.add(bones.hips);
  mesh.updateMatrixWorld(true);
  const skeleton = new Skeleton(MARINE_BONE_NAMES.map((n) => bones[n]));
  mesh.bind(skeleton);
  return mesh;
};
