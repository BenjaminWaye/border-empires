// Authoring script for the pop-up-marine battle overlay's model. Builds a
// tiny "toy soldier" — a small squad-figure silhouette in the spirit of
// classic plastic army-men and small-scale RTS unit models (Warcraft III /
// Age of Empires style unit icons, Company of Heroes at max zoom-out): a
// handful of large, bold, simple blocks rather than a detailed miniature.
// At the on-screen scale these marines render at (a few dozen pixels tall,
// flat MeshBasicMaterial, no textures), ~70% of readability comes from
// silhouette and only ~30% from surface detail — so this deliberately drops
// every faceted/multi-part detail from earlier passes (8-sided helmet,
// layered pauldron bevels, stepped backpack vents, separate
// stock/receiver/magazine rifle parts) in favor of 7 total primitive shapes:
// one leg block, a two-piece torso (waist + chest, a single geometric step,
// not a separate material), two exaggerated pauldrons (the ONE identifying
// "space marine" trait — big, blocky, unmissable), one smooth capsule-style
// helmet dome (no facets, no visor inset), and a single thin rifle plank.
// Every part still merges into one BufferGeometry (so the runtime's one
// InstancedMesh-per-side setup renders the whole silhouette, not just one
// sub-part) and bakes offline to packages/client/public/models/popup-marine.glb
// via GLTFExporter — no textures, no third-party asset, no network access.
// Re-run after editing:
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
//
// Scale note: this whole figure is ~1/10th the linear size of the previous
// pass (overall height ~0.052 tile-local units vs ~0.5 before) so a squad
// reads as small figures on a large battle tile rather than towering
// giants — see popup-marine-timeline.ts's MARINE_SPACING/
// FIRING_LINE_FWD_OFFSET and popup-marine-overlay-fx.ts's muzzle/crouch/fall
// offsets, which were scaled down to match.
import {
  BoxGeometry,
  BufferGeometry,
  Mesh,
  MeshStandardMaterial,
  Scene,
  SphereGeometry
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
function place(geometry, { x = 0, y = 0, z = 0 } = {}) {
  geometry.translate(x, y, z);
  return geometry;
}

function buildMarineGeometry() {
  const parts = [];

  // --- Legs: a single wide block standing in for the pair (a bracing
  // stance split doesn't survive to this scale as anything but noise) — a
  // sturdy rectangular base for the figure to stand on. y: 0 -> 0.020.
  parts.push(place(new BoxGeometry(0.020, 0.020, 0.020), { x: 0, y: 0.010, z: 0 }));

  // --- Torso: two stacked blocks — a narrower waist then a wider chest —
  // one bold geometric step marking the waist/chest break (no separate
  // material, no extra plates). y: 0.020 -> 0.040.
  parts.push(place(new BoxGeometry(0.018, 0.008, 0.017), { x: 0, y: 0.024, z: 0 })); // waist
  parts.push(place(new BoxGeometry(0.024, 0.014, 0.020), { x: 0, y: 0.033, z: 0 })); // chest

  // --- Shoulder pads (pauldrons): the ONE exaggerated identifying trait —
  // big, blocky, clearly wider and deeper than the torso and the helmet
  // flanking it, so "shoulders" reads instantly from any camera angle
  // (front, side, or oblique) without relying on surface detail. Kept
  // comfortably inside MARINE_SPACING (see popup-marine-timeline.ts) on the
  // X axis so adjacent marines still read as distinct figures.
  parts.push(place(new BoxGeometry(0.011, 0.013, 0.026), { x: -0.0165, y: 0.040, z: 0.001 }));
  parts.push(place(new BoxGeometry(0.011, 0.013, 0.026), { x: 0.0165, y: 0.040, z: 0.001 }));

  // --- Helmet: a plain smooth dome (no facets, no visor inset) —
  // deliberately narrower than the pauldrons so "shoulders wider than head"
  // reads instantly instead of the head/shoulders blending into one blob.
  parts.push(place(new SphereGeometry(0.0115, 12, 8, 0, Math.PI * 2, 0, Math.PI / 1.7), { x: 0, y: 0.042, z: 0 }));

  // --- Rifle: a single thin plank held forward at chest height — no
  // separate stock/receiver/magazine, those don't survive to pixel scale.
  // Muzzle tip lands at z≈0.028, y≈0.034;
  // popup-marine-overlay-fx.ts's MUZZLE_FWD_OFFSET/MUZZLE_Y must track this
  // if this geometry changes.
  parts.push(place(new BoxGeometry(0.004, 0.004, 0.030), { x: 0, y: 0.034, z: 0.013 }));

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
