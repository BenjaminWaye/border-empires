// Authoring script for the pop-up-marine battle overlay's model. Builds a
// tiny low-poly space-marine — legs in a firing stance, a shoulder-tapered
// torso, flared shoulder pads, a domed helmet with a visor notch, a
// backpack bump, and a forward-facing rifle — out of plain Three.js
// primitives, merges every part into a single BufferGeometry (so the
// runtime's one InstancedMesh-per-side setup renders the whole silhouette,
// not just one sub-part) and bakes it offline to
// packages/client/public/models/popup-marine.glb via GLTFExporter — no
// textures, no third-party asset, no network access. Re-run after editing:
//
//   node packages/client/scripts/bake-popup-marine-model.mjs
//
// The runtime never runs this script or GLTFExporter — only GLTFLoader
// (see popup-marine-asset.ts) loads the checked-in .glb it produces.
//
// Marine faces local +Z (see popup-marine-timeline.ts's facingYaw / the
// instance yaw applied in popup-marine-overlay-fx.ts) and stands with its
// origin at ground level (y=0). Keep the rifle centered on local x=0 and
// note its muzzle-tip z/y here — popup-marine-overlay-fx.ts's muzzle-flash
// offset constants must match this geometry or the flash floats disconnected
// from the rifle.
import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  Mesh,
  MeshStandardMaterial,
  Scene
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

// A part's local transform, applied to its geometry before merging (so the
// merged geometry is a single static "aiming" pose — the runtime animates
// the whole marine as one rigid instance via Matrix4, it does not puppet
// sub-parts, so there is nothing to gain from keeping parts separate past
// authoring time).
function place(geometry, { x = 0, y = 0, z = 0, rotX = 0 } = {}) {
  if (rotX) geometry.rotateX(rotX);
  geometry.translate(x, y, z);
  return geometry;
}

function buildMarineGeometry() {
  const parts = [];

  // Legs: firing stance, right leg stepped forward. y: 0 -> 0.20.
  parts.push(place(new BoxGeometry(0.05, 0.2, 0.07), { x: -0.045, y: 0.1, z: -0.02 }));
  parts.push(place(new BoxGeometry(0.05, 0.2, 0.07), { x: 0.045, y: 0.1, z: 0.04 }));

  // Torso: tapered wider at the shoulders than the waist. y: 0.20 -> 0.42
  // (~40% of the ~0.56 total height, per the design spec). Kept narrow
  // overall — see MARINE_FOOTPRINT_WIDTH in popup-marine-timeline.test.ts —
  // so the firing-line spacing (MARINE_SPACING) leaves a real visible gap
  // between adjacent marines instead of everything reading as one blob.
  parts.push(place(new BoxGeometry(0.11, 0.12, 0.12), { x: 0, y: 0.26, z: 0 })); // waist
  parts.push(place(new BoxGeometry(0.15, 0.1, 0.13), { x: 0, y: 0.37, z: 0 })); // chest

  // Shoulder pads: flared, proud of the shoulders — the primary
  // space-marine silhouette read, kept small enough to leave a gap between
  // adjacent marines in the firing line (see MARINE_SPACING in
  // popup-marine-timeline.ts).
  parts.push(place(new BoxGeometry(0.05, 0.07, 0.15), { x: -0.085, y: 0.41, z: 0.01 }));
  parts.push(place(new BoxGeometry(0.05, 0.07, 0.15), { x: 0.085, y: 0.41, z: 0.01 }));

  // Backpack: bump on the back, reads as a silhouette bulge from an
  // oblique camera.
  parts.push(place(new BoxGeometry(0.1, 0.16, 0.07), { x: 0, y: 0.4, z: -0.09 }));

  // Helmet: rounded dome directly on the torso (no neck) plus a thin dark
  // visor-slit notch for a bit of facial read.
  parts.push(place(new CylinderGeometry(0.09, 0.1, 0.14, 8), { x: 0, y: 0.49, z: 0 }));
  parts.push(place(new BoxGeometry(0.11, 0.02, 0.02), { x: 0, y: 0.47, z: 0.095 }));

  // Rifle: held roughly horizontal at chest height, extending forward
  // (local +Z, the marine's facing direction) — muzzle tip at z≈0.44,
  // y≈0.34. popup-marine-overlay-fx.ts's MUZZLE_FWD_OFFSET/MUZZLE_Y must
  // track these if this geometry changes.
  parts.push(place(new BoxGeometry(0.04, 0.04, 0.3), { x: 0, y: 0.34, z: 0.15 }));
  parts.push(
    place(new CylinderGeometry(0.015, 0.015, 0.14, 6), { x: 0, y: 0.34, z: 0.37, rotX: Math.PI / 2 })
  );

  const merged = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  return merged;
}

const scene = new Scene();
const mat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0.05 });
const geometry = buildMarineGeometry();
if (!(geometry instanceof BufferGeometry)) throw new Error("mergeGeometries failed to produce a BufferGeometry");
scene.add(new Mesh(geometry, mat));

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
