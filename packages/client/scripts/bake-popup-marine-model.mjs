// Authoring script for the pop-up-marine battle overlay's model. Builds a
// tiny "toy soldier" — a small squad-figure silhouette in the spirit of
// classic plastic army-men and small-scale RTS unit models (Warcraft III /
// Age of Empires style unit icons, Company of Heroes at max zoom-out): a
// handful of large, bold, simple blocks rather than a detailed miniature.
// At the on-screen scale these marines render at (a few dozen pixels tall,
// lit MeshStandardMaterial + per-part vertex-color tint, no textures), ~70%
// of readability comes from silhouette and only ~30% from surface detail —
// so this keeps the previous pass's 7-primitive-shape silhouette (one leg
// block split into a left/right pair, a two-piece torso, two pauldrons, one
// smooth helmet dome, one rifle) and adds a minimal bone skeleton on top so
// the runtime can animate limbs independently instead of moving the whole
// marine as one rigid block. Two small arm parts (upper/lower right arm,
// one left-arm part) are new — they did not exist as visible geometry
// before (the rifle floated off the torso with no arm holding it) — kept
// deliberately thin/small so the previously-approved silhouette does not
// visibly change at this render scale; every other part's shape/size is
// unchanged from the previous (non-skinned) pass.
//
// This still bakes to a single SkinnedMesh (one BufferGeometry, one
// Skeleton) rather than a separate mesh per part — the runtime renders one
// SkinnedMesh per marine slot (see popup-marine-overlay-fx.ts), so merging
// parts here keeps that to one draw call per marine, same as the old
// InstancedMesh approach was one draw call per SIDE.
//
// Every vertex is skinned to exactly ONE bone (skinWeight [1,0,0,0]) — rigid
// per-part weighting, not smooth multi-bone blending. That's the simplest
// correct way to bind a part-based low-poly model like this: each part
// already maps cleanly onto "this whole part = this one bone" (the leg
// block IS the leg, the chest/waist boxes ARE the torso, etc.), and at this
// on-screen scale smooth skinning would buy nothing visible.
//
// Bakes offline to packages/client/public/models/popup-marine.glb via
// GLTFExporter — no textures, no third-party asset, no network access.
// Re-run after editing:
//
//   node packages/client/scripts/bake-popup-marine-model.mjs
//
// The runtime never runs this script or GLTFExporter — only GLTFLoader
// (see popup-marine-asset.ts) loads the checked-in .glb it produces, then
// clones it per marine slot via SkeletonUtils.clone so each marine gets its
// own independently-posable skeleton.
//
// Marine faces local +Z (see popup-marine-timeline.ts's facingYaw / the yaw
// applied in popup-marine-overlay-fx.ts) and stands with its root (the
// "hips" bone) at ground level (y=0). The right arm (armR_upper/armR_lower)
// holds the rifle — popup-marine-overlay-fx.ts reads armR_lower's live
// world matrix each frame to place the muzzle flash, so it tracks whatever
// pose the runtime puts the arm in rather than a fixed offset baked here.
//
// Scale: unchanged from the previous pass — overall height ~0.052
// tile-local units — see popup-marine-timeline.ts's MARINE_SPACING /
// FIRING_LINE_FWD_OFFSET, which stay matched to this.
import {
  Bone,
  BoxGeometry,
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  MeshStandardMaterial,
  Scene,
  Skeleton,
  SkinnedMesh,
  SphereGeometry,
  Uint16BufferAttribute
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { writeFileSync } from "node:fs";

globalThis.self = globalThis;

// three's GLTFExporter (binary path) reads the assembled GLB body back out
// via FileReader, which only exists in browsers/jsdom. This repo has no DOM
// dependency otherwise, so this authoring script (run offline, only to bake
// the checked-in .glb — never at runtime) provides the minimal subset it
// needs rather than pulling in jsdom as a real dependency.
class NodeFileReader {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buf) => {
      this.result = buf;
      this.onloadend?.();
    });
  }
}
globalThis.FileReader = NodeFileReader;

// A part's local transform, applied to its geometry before merging. Parts
// are authored directly in the marine's absolute rest-pose coordinate frame
// (same frame the bones' rest-pose matrixWorld ends up in below) — that's
// what makes "bind while every bone sits at its authored rest position"
// produce a skin that matches this static geometry exactly.
function place(geometry, { x = 0, y = 0, z = 0 } = {}) {
  geometry.translate(x, y, z);
  return geometry;
}

// Paints every vertex of a part with the same flat color, as a per-vertex
// "color" attribute (glTF COLOR_0) — see MARINE_VERTEX_TINT below for what
// each value means at runtime.
function colorize(geometry, [r, g, b]) {
  const vertexCount = geometry.attributes.position.count;
  const colors = new Float32Array(vertexCount * 3);
  for (let i = 0; i < vertexCount; i++) {
    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  return geometry;
}

// Binds every vertex of a part rigidly to one bone: skinIndex always points
// at `boneIndex` (in the same order BONE_NAMES/bones are built below) with
// full weight on slot 0 and zero on the other three slots.
function bindToBone(geometry, boneIndex) {
  const vertexCount = geometry.attributes.position.count;
  const skinIndex = new Uint16Array(vertexCount * 4);
  const skinWeight = new Float32Array(vertexCount * 4);
  for (let i = 0; i < vertexCount; i++) {
    skinIndex[i * 4] = boneIndex;
    skinWeight[i * 4] = 1;
  }
  geometry.setAttribute("skinIndex", new Uint16BufferAttribute(skinIndex, 4));
  geometry.setAttribute("skinWeight", new Float32BufferAttribute(skinWeight, 4));
  return geometry;
}

// Per-part vertex-color multipliers (see colorize() above). Team-colored
// armor plates stay near white so the attacker/defender tint (now applied
// per-marine via SkinnedMesh.material.color, see popup-marine-overlay-fx.ts)
// reads at full strength; joints get a mid grey; helmet/rifle/arms get a
// near-black value so they read as dark neutral equipment.
const MARINE_VERTEX_TINT = {
  legs: [0.85, 0.85, 0.85],
  waist: [0.5, 0.5, 0.5],
  chest: [1, 1, 1],
  pauldron: [0.92, 0.92, 0.92],
  helmet: [0.16, 0.16, 0.18],
  rifle: [0.14, 0.14, 0.15],
  arm: [0.5, 0.5, 0.5]
};

// Bone rest-pose positions, in the marine's absolute coordinate frame
// (matches how parts are placed above). Order here IS the skinIndex order
// used by bindToBone() calls below and the bone hierarchy built afterward —
// keep them in sync.
const BONE_NAMES = ["hips", "spine", "armR_upper", "armR_lower", "armL", "legL", "legR"];
const BONE_REST = {
  hips: { x: 0, y: 0, z: 0 },
  spine: { x: 0, y: 0.02, z: 0 },
  armR_upper: { x: 0.0165, y: 0.036, z: 0.006 },
  armR_lower: { x: 0.0165, y: 0.034, z: 0.018 },
  armL: { x: -0.0165, y: 0.036, z: 0.006 },
  legL: { x: -0.007, y: 0, z: 0 },
  legR: { x: 0.007, y: 0, z: 0 }
};
const BONE_PARENT = {
  hips: null,
  spine: "hips",
  armR_upper: "spine",
  armR_lower: "armR_upper",
  armL: "spine",
  legL: "hips",
  legR: "hips"
};
const boneIndexOf = (name) => BONE_NAMES.indexOf(name);

function buildBones() {
  const bones = {};
  for (const name of BONE_NAMES) {
    const bone = new Bone();
    bone.name = name;
    bones[name] = bone;
  }
  for (const name of BONE_NAMES) {
    const parentName = BONE_PARENT[name];
    const rest = BONE_REST[name];
    if (parentName) {
      const parentRest = BONE_REST[parentName];
      bones[name].position.set(rest.x - parentRest.x, rest.y - parentRest.y, rest.z - parentRest.z);
      bones[parentName].add(bones[name]);
    } else {
      bones[name].position.set(rest.x, rest.y, rest.z);
    }
  }
  return bones;
}

function buildMarineGeometry() {
  const parts = [];

  // --- Legs: split into a left/right pair, narrower than the torso above
  // them (0.007 wide per leg vs. the 0.018-wide waist / 0.024-wide chest)
  // and spread into a visible wide bracing/firing stance with a real gap
  // between them (0.007 gap — as wide as either leg — rather than the
  // previous 0.002 hairline that read as one flush block continuing the
  // torso down to the ground; see the PR description for the
  // native-resolution before/after this was checked against).
  parts.push(bindToBone(colorize(place(new BoxGeometry(0.007, 0.020, 0.018), { x: -0.007, y: 0.010, z: 0 }), MARINE_VERTEX_TINT.legs), boneIndexOf("legL")));
  parts.push(bindToBone(colorize(place(new BoxGeometry(0.007, 0.020, 0.018), { x: 0.007, y: 0.010, z: 0 }), MARINE_VERTEX_TINT.legs), boneIndexOf("legR")));

  // --- Torso: two stacked blocks — a narrower waist then a wider chest —
  // rigidly bound to the spine bone (a single geometric step marking the
  // waist/chest break, no separate material). y: 0.020 -> 0.040.
  parts.push(bindToBone(colorize(place(new BoxGeometry(0.018, 0.008, 0.017), { x: 0, y: 0.024, z: 0 }), MARINE_VERTEX_TINT.waist), boneIndexOf("spine")));
  parts.push(bindToBone(colorize(place(new BoxGeometry(0.024, 0.014, 0.020), { x: 0, y: 0.033, z: 0 }), MARINE_VERTEX_TINT.chest), boneIndexOf("spine")));

  // --- Shoulder pads (pauldrons): rigidly bound to spine (kept simple —
  // the arm bones underneath do the visible aim/recoil motion; the
  // pauldrons riding along with the torso reads fine at this scale).
  parts.push(bindToBone(colorize(place(new BoxGeometry(0.011, 0.013, 0.026), { x: -0.0165, y: 0.040, z: 0.001 }), MARINE_VERTEX_TINT.pauldron), boneIndexOf("spine")));
  parts.push(bindToBone(colorize(place(new BoxGeometry(0.011, 0.013, 0.026), { x: 0.0165, y: 0.040, z: 0.001 }), MARINE_VERTEX_TINT.pauldron), boneIndexOf("spine")));

  // --- Helmet: rigidly bound to spine (no separate head bone — a moving
  // head isn't critical at this scale, per the design brief).
  parts.push(bindToBone(colorize(place(new SphereGeometry(0.0115, 12, 8, 0, Math.PI * 2, 0, Math.PI / 1.7), { x: 0, y: 0.042, z: 0 }), MARINE_VERTEX_TINT.helmet), boneIndexOf("spine")));

  // --- Right arm: upper-arm block bound to armR_upper, forearm/hand block
  // bound to armR_lower — these are the two bones that swing the rifle up
  // to aim and kick back on fire.
  parts.push(bindToBone(colorize(place(new BoxGeometry(0.007, 0.007, 0.009), { x: 0.0165, y: 0.036, z: 0.006 }), MARINE_VERTEX_TINT.arm), boneIndexOf("armR_upper")));
  parts.push(bindToBone(colorize(place(new BoxGeometry(0.006, 0.006, 0.009), { x: 0.0165, y: 0.034, z: 0.017 }), MARINE_VERTEX_TINT.arm), boneIndexOf("armR_lower")));

  // --- Left arm: single simple block bracing the rifle, bound to armL —
  // mirrors the right arm's upper segment but with no forearm bone (less
  // critical motion, per the design brief).
  parts.push(bindToBone(colorize(place(new BoxGeometry(0.007, 0.007, 0.013), { x: -0.0165, y: 0.036, z: 0.010 }), MARINE_VERTEX_TINT.arm), boneIndexOf("armL")));

  // --- Rifle: a single thin plank, bound to armR_lower (the hand) so it
  // moves with the arm instead of floating fixed to the torso. Muzzle tip
  // sits ~0.017 ahead of the armR_lower bone's rest position; the runtime
  // reads the live bone world matrix each frame rather than a fixed offset
  // (see popup-marine-overlay-fx.ts), so this only has to be a reasonable
  // rest-pose placement, not an exact contract.
  parts.push(bindToBone(colorize(place(new BoxGeometry(0.004, 0.004, 0.026), { x: 0.0165, y: 0.034, z: 0.028 }), MARINE_VERTEX_TINT.rifle), boneIndexOf("armR_lower")));

  const merged = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  return merged;
}

const scene = new Scene();
const mat = new MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.42, metalness: 0.4 });
const geometry = buildMarineGeometry();
if (!(geometry instanceof BufferGeometry)) throw new Error("mergeGeometries failed to produce a BufferGeometry");

const bones = buildBones();
const hips = bones.hips;
const skinnedMesh = new SkinnedMesh(geometry, mat);
skinnedMesh.add(hips);
skinnedMesh.updateMatrixWorld(true);
const skeleton = new Skeleton(BONE_NAMES.map((n) => bones[n]));
skinnedMesh.bind(skeleton);
scene.add(skinnedMesh);

const exporter = new GLTFExporter();
exporter.parse(
  scene,
  (result) => {
    writeFileSync(
      new URL("../public/models/popup-marine.glb", import.meta.url),
      Buffer.from(result)
    );
    console.log("wrote glb, bytes:", result.byteLength);
  },
  (err) => { console.error("export failed", err); process.exit(1); },
  { binary: true }
);
