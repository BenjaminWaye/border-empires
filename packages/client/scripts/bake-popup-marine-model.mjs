// Authoring script for the pop-up-marine battle overlay's model. Builds a
// tiny low-poly Warhammer-40k-style "space marine" in power armor — a wide
// bracing stance with armored greaves and flared boots, a stocky
// shoulders-heavy torso with a waist-belt break and a chest insignia plate,
// big proud angular pauldrons, a faceted combat helmet with a visor band
// overlapping straight onto the shoulders (no neck gap), a stepped
// twin-vent backpack, and a forward rifle with a stock/barrel/magazine — out
// of plain Three.js primitives, merges every part into a single
// BufferGeometry (so the runtime's one InstancedMesh-per-side setup renders
// the whole silhouette, not just one sub-part) and bakes it offline to
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

  // --- Legs: wide bracing/firing stance, right leg stepped forward. Each
  // leg is three stacked volumes (thigh plate -> narrower ankle -> flared
  // boot) instead of one stick, so the silhouette reads as armored greaves
  // rather than toothpicks. y: 0 -> 0.22.
  for (const [legX, legZ] of [
    [-0.09, -0.02], // left leg, planted
    [0.09, 0.05] // right leg, stepped forward (bracing stance)
  ]) {
    parts.push(place(new BoxGeometry(0.075, 0.1, 0.09), { x: legX, y: 0.17, z: legZ })); // thigh plate
    parts.push(place(new BoxGeometry(0.045, 0.08, 0.06), { x: legX, y: 0.08, z: legZ })); // ankle
    parts.push(place(new BoxGeometry(0.09, 0.045, 0.13), { x: legX, y: 0.0225, z: legZ + 0.015 })); // flared boot
  }

  // --- Torso: the dominant mass of the figure. A narrower waist block, a
  // thin raised belt band marking the waist/chest break, then a wide chest
  // plate leaning slightly forward for an aggressive stance. y: 0.22 -> 0.42.
  parts.push(place(new BoxGeometry(0.13, 0.06, 0.13), { x: 0, y: 0.25, z: 0 })); // waist
  parts.push(place(new BoxGeometry(0.15, 0.02, 0.14), { x: 0, y: 0.28, z: 0 })); // belt band (raised break)
  parts.push(place(new BoxGeometry(0.19, 0.14, 0.15), { x: 0, y: 0.35, z: 0.01 })); // chest plate

  // Chest detail: a single small raised plate (insignia/reactor housing) to
  // break up the flat chest slab without adding real poly cost.
  parts.push(place(new BoxGeometry(0.05, 0.05, 0.02), { x: 0, y: 0.37, z: 0.085 }));

  // --- Shoulder pads (pauldrons): big, angular, clearly wider than the
  // torso, sitting proud right up near the neckline — the primary
  // space-marine silhouette read. Kept just inside MARINE_SPACING (see
  // popup-marine-timeline.ts) on the left-right (X) axis so adjacent
  // marines still read as distinct, and given real depth (Z) too — battles
  // can face any direction on the map, so the pads must read as a proud
  // flare from a front, side, or oblique camera alike, not just one axis.
  parts.push(place(new BoxGeometry(0.06, 0.11, 0.24), { x: -0.11, y: 0.4, z: 0.03 }));
  parts.push(place(new BoxGeometry(0.065, 0.12, 0.25), { x: 0.11, y: 0.4, z: 0.03 })); // right: slightly bigger, holds the rifle

  // --- Backpack: back-mounted box with two small stepped exhaust vents so
  // it reads as mechanical rather than a single flat slab.
  parts.push(place(new BoxGeometry(0.11, 0.16, 0.06), { x: 0, y: 0.36, z: -0.1 }));
  parts.push(place(new BoxGeometry(0.03, 0.05, 0.03), { x: -0.035, y: 0.445, z: -0.115 }));
  parts.push(place(new BoxGeometry(0.03, 0.05, 0.03), { x: 0.035, y: 0.445, z: -0.115 }));

  // --- Helmet: a faceted (8-sided) combat-helmet dome, deliberately narrower
  // than the pauldrons flanking it (so "shoulders wider than head" reads
  // instantly, instead of the head/shoulders blending into one blob),
  // overlapping directly onto the torso/shoulder pads (no neck gap), plus a
  // recessed horizontal visor band across the front.
  parts.push(place(new CylinderGeometry(0.065, 0.078, 0.12, 8), { x: 0, y: 0.44, z: 0 }));
  parts.push(place(new BoxGeometry(0.1, 0.022, 0.02), { x: 0, y: 0.435, z: 0.07 })); // visor band

  // --- Rifle: held forward at chest height, given real shape — a stock, a
  // boxy receiver, a barrel, and a magazine — instead of one flat plank.
  // Muzzle tip lands at z≈0.39, y≈0.34;
  // popup-marine-overlay-fx.ts's MUZZLE_FWD_OFFSET/MUZZLE_Y must track this
  // if this geometry changes.
  parts.push(place(new BoxGeometry(0.04, 0.05, 0.09), { x: 0, y: 0.345, z: -0.02 })); // stock
  parts.push(place(new BoxGeometry(0.035, 0.035, 0.22), { x: 0, y: 0.34, z: 0.1 })); // receiver/body
  parts.push(place(new BoxGeometry(0.022, 0.07, 0.03), { x: 0, y: 0.29, z: 0.09 })); // magazine
  parts.push(
    place(new CylinderGeometry(0.012, 0.012, 0.18, 6), { x: 0, y: 0.34, z: 0.3, rotX: Math.PI / 2 })
  ); // barrel, tip at z=0.39

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
