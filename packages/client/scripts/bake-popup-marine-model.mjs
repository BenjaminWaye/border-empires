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
// smooth helmet dome, one rifle) — plus this pass's chest boss and
// backpack (see below) — and adds a minimal bone skeleton on top so
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
  ExtrudeGeometry,
  Float32BufferAttribute,
  Mesh,
  MeshStandardMaterial,
  Scene,
  Shape,
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

// Builds a BoxGeometry whose top and/or bottom face is scaled inward
// (independently in X and Z) relative to its center — i.e. a trapezoidal
// prism instead of a perfect rectangular block. This is the main "de-clunk"
// tool used below: butting two perfectly rectangular boxes together (legs
// into hips, arms into shoulders, waist into chest) reads as LEGO-brick
// seams at this low-poly style, while a part that visibly narrows or widens
// toward its neighbor reads as one flowing figure. Kept cheap (still just a
// box's 8 corners nudged, same 6 quads/24 verts) rather than adding real
// bevel geometry, since the polycount budget here is meant to stay tiny.
function taperedBoxAlongY(width, height, depth, { topScaleX = 1, topScaleZ = 1, bottomScaleX = 1, bottomScaleZ = 1 } = {}) {
  const geometry = new BoxGeometry(width, height, depth, 1, 1, 1);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i);
    const [sx, sz] = y > 0 ? [topScaleX, topScaleZ] : [bottomScaleX, bottomScaleZ];
    if (sx !== 1) position.setX(i, position.getX(i) * sx);
    if (sz !== 1) position.setZ(i, position.getZ(i) * sz);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

// Same idea, but tapers along local Z (front/back) instead of Y — used for
// the arm segments, whose long axis runs forward (toward the elbow/hand)
// rather than up.
function taperedBoxAlongZ(width, height, depth, { farScaleX = 1, farScaleY = 1, nearScaleX = 1, nearScaleY = 1 } = {}) {
  const geometry = new BoxGeometry(width, height, depth, 1, 1, 1);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const z = position.getZ(i);
    const [sx, sy] = z > 0 ? [farScaleX, farScaleY] : [nearScaleX, nearScaleY];
    if (sx !== 1) position.setX(i, position.getX(i) * sx);
    if (sy !== 1) position.setY(i, position.getY(i) * sy);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

// Builds a shield/pauldron-shaped solid: a 2D heater-shield outline (domed
// top, gently bulging "belly", tapering to a point at the bottom — the
// classic Warhammer-pauldron/shield-plate silhouette) drawn in the Y-Z plane
// and extruded a short distance along X with a small bevel, producing a
// flat chunky plate rather than a thin blade.
//
// A first attempt used LatheGeometry (radius-vs-height profile revolved
// around Y, then stretched non-uniformly in X/Z) — verified visually via
// the native-resolution inspector (see PR description) and rejected: full
// radial revolution makes the shape look identical from every angle around
// Y, so it read as a rounded egg/orb rather than a shield (no flat "face" a
// shield plate needs, and no distinct silhouette change between the front
// view and the side view — a real difference from the intended pauldron
// look). An extruded 2D outline gives the pad an actual flat outward face
// with a genuine shield silhouette instead.
function shieldPauldronGeometry() {
  // The outline's height (its local Y spread, dome-to-point) is scaled down
  // by SHAPE_Y_SCALE below — see the rotation comment for why: at this
  // near-90-degree PERSPECTIVE_TILT_RADIANS rotation, the outline's Y axis
  // maps almost entirely onto world Z (front/back), so the outline's height
  // is what was actually driving the side-profile overflow, not its width
  // (X, left/right — the shoulder direction, unaffected by this rotation
  // and left alone here). Width (X) is untouched so the shield still reads
  // full-size from the real front camera.
  const SHAPE_Y_SCALE = 0.65;
  const shape = new Shape();
  shape.moveTo(-0.011, 0.003 * SHAPE_Y_SCALE);
  shape.quadraticCurveTo(-0.011, 0.0078 * SHAPE_Y_SCALE, 0, 0.0078 * SHAPE_Y_SCALE); // dome: left up to top-center
  shape.quadraticCurveTo(0.011, 0.0078 * SHAPE_Y_SCALE, 0.011, 0.003 * SHAPE_Y_SCALE); // dome: top-center to right
  shape.quadraticCurveTo(0.013, -0.001 * SHAPE_Y_SCALE, 0.008, -0.0045 * SHAPE_Y_SCALE); // right belly curving in
  shape.quadraticCurveTo(0.004, -0.0075 * SHAPE_Y_SCALE, 0, -0.0085 * SHAPE_Y_SCALE); // taper down to the bottom point
  shape.quadraticCurveTo(-0.004, -0.0075 * SHAPE_Y_SCALE, -0.008, -0.0045 * SHAPE_Y_SCALE); // mirror: taper back up
  shape.quadraticCurveTo(-0.013, -0.001 * SHAPE_Y_SCALE, -0.011, 0.003 * SHAPE_Y_SCALE); // left belly back to start

  // Extrude depth (the shield plate's own thickness) was also shrunk from
  // 0.011 to 0.0045 — after the same rotation, thickness maps partly onto
  // world Z too (see rotation comment below), so a thinner plate further
  // tightens the side-profile footprint, and a shield this size reads fine
  // as a flatter plate from the front camera.
  const thickness = 0.0045;
  const geometry = new ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: 0.0011,
    bevelSize: 0.0011,
    bevelSegments: 2,
    steps: 1,
    curveSegments: 8
  });
  // ExtrudeGeometry extrudes along +Z (its shape plane's normal) starting
  // at z=0; center that on the origin. The PREVIOUS pass rotated this
  // shape's plane about Y so the extrude (thickness/face-normal) axis
  // became local X — hugging the shoulder, sideways. That was verified
  // against a made-up "3/4 perspective" test camera and looked fine there,
  // but is wrong for the REAL in-game camera (see
  // client-map-3d-perspective-camera.ts): PERSPECTIVE_TILT_RADIANS = 0.6,
  // zero X offset, camera sitting almost directly above the marine and
  // tilted down ~34 degrees. From that near-top-down angle a face normal
  // pointing along X is edge-on to the camera — you see the extrude's thin
  // profile, which reads as a cylindrical drum, not a shield face.
  //
  // Fix: keep the shape's own X axis (the outline's left-right spread) as
  // world X — that's already the correct shoulder-width direction, no swap
  // needed. Instead, rotate the (shapeY, extrudeZ) pair about X so the
  // extrude/normal axis points toward where the real camera actually sits:
  // up and toward the camera's south offset, i.e. close to
  // (0, cos(TILT), sin(TILT)) in world space. Solving "pre-rotation +Z axis
  // maps to (0, cos(TILT), sin(TILT))" for a rotation about X gives angle
  // (TILT - PI/2): rotateX(0,0,1) -> (0, -sin(TILT - PI/2), cos(TILT - PI/2))
  // = (0, cos(TILT), sin(TILT)) as required. This tilts the shield's dome
  // back and up (away from the camera) and its face up-and-toward the
  // camera — verified against the real camera math in the throwaway
  // inspector described in the PR, not an arbitrary test angle.
  const PERSPECTIVE_TILT_RADIANS = 0.6;
  geometry.translate(0, 0, -thickness / 2);
  geometry.rotateX(PERSPECTIVE_TILT_RADIANS - Math.PI / 2);
  return geometry;
}

// A part's local transform, applied to its geometry before merging. Parts
// are authored directly in the marine's absolute rest-pose coordinate frame
// (same frame the bones' rest-pose matrixWorld ends up in below) — that's
// what makes "bind while every bone sits at its authored rest position"
// produce a skin that matches this static geometry exactly.
function place(geometry, { x = 0, y = 0, z = 0 } = {}) {
  // Normalize to non-indexed before placement so every part (whether built
  // from BoxGeometry, which is indexed by default, or RoundedBoxGeometry,
  // which is not) has compatible attributes for mergeGeometries() below.
  if (geometry.index) geometry = geometry.toNonIndexed();
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
  kneecap: [0.62, 0.62, 0.62],
  waist: [0.5, 0.5, 0.5],
  chest: [1, 1, 1],
  chestBoss: [0.16, 0.16, 0.18],
  pauldron: [0.92, 0.92, 0.92],
  helmet: [0.16, 0.16, 0.18],
  rifle: [0.14, 0.14, 0.15],
  arm: [0.5, 0.5, 0.5],
  backpack: [0.16, 0.16, 0.18]
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
  // native-resolution before/after this was checked against). Tapered
  // narrower at the boot than at the hip (bottomScale 0.72) instead of a
  // perfect rectangular block — a straight-sided box leg butted flush
  // against the hip read as a LEGO peg; a slight taper makes it read as a
  // limb instead of an extruded brick.
  // Each leg is now two stacked plates instead of one smooth taper: a wider
  // thigh plate (hip -> knee) and a narrower shin/greave plate (knee ->
  // boot), with a small knee-cap accent box bridging the seam between them —
  // echoing how the torso already breaks into waist/chest. Thigh tapers
  // narrower toward the knee, shin tapers narrower again toward the boot, so
  // the overall silhouette still reads as one continuously-tapering limb
  // (matches the previous pass's bottomScaleX 0.72 overall taper) while now
  // showing a visible plate seam partway down instead of one flat run.
  for (const side of [{ name: "legL", x: -0.007 }, { name: "legR", x: 0.007 }]) {
    const bone = boneIndexOf(side.name);
    // Thigh plate: hip (y=0.020) down to knee (y=0.013), full leg width at
    // top tapering down toward the knee.
    parts.push(bindToBone(colorize(place(taperedBoxAlongY(0.0072, 0.007, 0.0185, { topScaleX: 1, topScaleZ: 1, bottomScaleX: 0.86, bottomScaleZ: 0.9 }), { x: side.x, y: 0.0165, z: 0 }), MARINE_VERTEX_TINT.legs), bone));
    // Knee-cap accent: a tiny box at the plate seam, tinted slightly darker
    // so the seam reads as a distinct joint piece rather than a shading
    // artifact.
    parts.push(bindToBone(colorize(place(new BoxGeometry(0.0062, 0.003, 0.017), { x: side.x, y: 0.013, z: 0.0015 }), MARINE_VERTEX_TINT.kneecap), bone));
    // Shin/greave plate: knee (y=0.013) down to boot (y=0.000), continuing
    // the taper narrower toward the boot.
    parts.push(bindToBone(colorize(place(taperedBoxAlongY(0.0062, 0.013, 0.0165, { topScaleX: 1, topScaleZ: 1, bottomScaleX: 0.72, bottomScaleZ: 0.8 }), { x: side.x, y: 0.0065, z: 0 }), MARINE_VERTEX_TINT.legs), bone));
  }

  // --- Torso: two stacked blocks — a narrower waist then a wider chest —
  // rigidly bound to the spine bone. y: 0.020 -> 0.040. The waist is
  // tapered wider at its top edge (toward the chest) and narrower at its
  // bottom edge (toward the hips) so the waist/chest and waist/hip breaks
  // read as a flowing torso silhouette instead of two flat rectangular
  // steps glued together.
  parts.push(bindToBone(colorize(place(taperedBoxAlongY(0.018, 0.008, 0.017, { topScaleX: 1.2, topScaleZ: 1.12, bottomScaleX: 0.85, bottomScaleZ: 0.9 }), { x: 0, y: 0.024, z: 0 }), MARINE_VERTEX_TINT.waist), boneIndexOf("spine")));
  parts.push(bindToBone(colorize(place(taperedBoxAlongY(0.024, 0.014, 0.020, { bottomScaleX: 0.88, bottomScaleZ: 0.9 }), { x: 0, y: 0.033, z: 0 }), MARINE_VERTEX_TINT.chest), boneIndexOf("spine")));

  // --- Chest boss: a small raised insignia/detail block centered on the
  // chestplate's front face (local +Z, the direction the marine faces —
  // see the file header). One cheap extra primitive per the design brief
  // ("a small raised chest boss/insignia detail... one small extra
  // primitive, keep it cheap"): a flat-ish box proud of the chest surface,
  // dark-neutral tinted like the helmet/rifle so it reads as an equipment
  // detail against the team-colored chest plate rather than blending into
  // it. Centered vertically on the chest block (y 0.033) and pushed to
  // just past the chest's front face (chest depth 0.020 -> half-depth
  // 0.010, plus half this part's own depth) so it sits proud instead of
  // clipping into the chest geometry.
  parts.push(bindToBone(colorize(place(new BoxGeometry(0.006, 0.006, 0.003), { x: 0, y: 0.034, z: 0.0115 }), MARINE_VERTEX_TINT.chestBoss), boneIndexOf("spine")));

  // --- Shoulder pads (pauldrons): rigidly bound to spine (kept simple —
  // the arm bones underneath do the visible aim/recoil motion; the
  // pauldrons riding along with the torso reads fine at this scale).
  // Built from shieldPauldronGeometry() (see above) instead of the previous
  // pass's RoundedBoxGeometry: a rounded capsule/pill read as generic
  // "rounded armor," not a shield. The lathed profile gives a domed top
  // that curves down to a tapered point at the bottom — the classic
  // heater-shield / pauldron silhouette — while keeping the same rough
  // footprint/scale as before so the pauldrons stay the single most
  // exaggerated/identifying silhouette feature rather than shrinking.
  parts.push(bindToBone(colorize(place(shieldPauldronGeometry(), { x: -0.0165, y: 0.040, z: 0.001 }), MARINE_VERTEX_TINT.pauldron), boneIndexOf("spine")));
  parts.push(bindToBone(colorize(place(shieldPauldronGeometry(), { x: 0.0165, y: 0.040, z: 0.001 }), MARINE_VERTEX_TINT.pauldron), boneIndexOf("spine")));

  // --- Helmet: rigidly bound to spine (no separate head bone — a moving
  // head isn't critical at this scale, per the design brief). Dropped
  // 0.0015 lower than the previous pass so the dome sinks further into the
  // chest collar instead of floating above it with a visible gap/notch at
  // 3/4 angles.
  parts.push(bindToBone(colorize(place(new SphereGeometry(0.0115, 12, 8, 0, Math.PI * 2, 0, Math.PI / 1.7), { x: 0, y: 0.0405, z: 0 }), MARINE_VERTEX_TINT.helmet), boneIndexOf("spine")));

  // --- Right arm: upper-arm block bound to armR_upper, forearm/hand block
  // bound to armR_lower — these are the two bones that swing the rifle up
  // to aim and kick back on fire. Each segment tapers narrower toward its
  // far end (shoulder->elbow, elbow->hand) instead of being a uniform-
  // thickness peg, echoing the leg taper above.
  parts.push(bindToBone(colorize(place(taperedBoxAlongZ(0.007, 0.007, 0.009, { farScaleX: 0.78, farScaleY: 0.85 }), { x: 0.0165, y: 0.036, z: 0.006 }), MARINE_VERTEX_TINT.arm), boneIndexOf("armR_upper")));
  parts.push(bindToBone(colorize(place(taperedBoxAlongZ(0.006, 0.006, 0.009, { farScaleX: 0.78, farScaleY: 0.85 }), { x: 0.0165, y: 0.034, z: 0.017 }), MARINE_VERTEX_TINT.arm), boneIndexOf("armR_lower")));

  // --- Left arm: single simple block bracing the rifle, bound to armL —
  // mirrors the right arm's upper segment but with no forearm bone (less
  // critical motion, per the design brief).
  parts.push(bindToBone(colorize(place(taperedBoxAlongZ(0.007, 0.007, 0.013, { farScaleX: 0.78, farScaleY: 0.85 }), { x: -0.0165, y: 0.036, z: 0.010 }), MARINE_VERTEX_TINT.arm), boneIndexOf("armL")));

  // --- Backpack: a compact stepped power-pack block on the marine's back
  // (local -Z, opposite the direction the marine faces — see the file
  // header) with a twin-vent silhouette, per the design brief ("compact
  // stepped power-pack block, twin-vent silhouette"). This did not exist
  // before this pass. Built from three parts, all bound to spine (it rides
  // with the torso, same as the pauldrons/helmet):
  //  - one main block, stepped narrower toward the top so the silhouette
  //    reads as a distinct pack rather than a flat slab flush with the
  //    torso;
  //  - two thin vertical vent strips proud of the block's back face,
  //    tinted dark-neutral like the helmet/rifle, giving the "twin-vent"
  //    read called out in the brief without adding real greeble geometry
  //    (kept to 2 cheap extra boxes, same low-poly budget as the rest of
  //    the model).
  // Waist sits at y 0.020-0.028, chest at y 0.026-0.040 (see above) — the
  // pack spans roughly that same range so it reads as sitting against the
  // torso, not floating above or below it.
  parts.push(bindToBone(colorize(place(taperedBoxAlongY(0.014, 0.016, 0.008, { topScaleX: 0.82, topScaleZ: 0.85 }), { x: 0, y: 0.031, z: -0.0135 }), MARINE_VERTEX_TINT.backpack), boneIndexOf("spine")));
  for (const ventX of [-0.0028, 0.0028]) {
    parts.push(bindToBone(colorize(place(new BoxGeometry(0.0035, 0.012, 0.003), { x: ventX, y: 0.031, z: -0.019 }), MARINE_VERTEX_TINT.backpack), boneIndexOf("spine")));
  }

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
