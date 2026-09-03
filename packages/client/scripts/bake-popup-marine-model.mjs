// Authoring script for the pop-up-marine battle overlay's model. Builds a
// tiny low-poly space-marine (boxes for legs/torso/shoulders/helmet, a box
// visor, a cylinder rifle barrel, a cone antenna) out of plain Three.js
// primitives and bakes it offline to packages/client/public/models/
// popup-marine.glb via GLTFExporter — no textures, no third-party asset, no
// network access. Re-run after editing:
//
//   node packages/client/scripts/bake-popup-marine-model.mjs
//
// The runtime never runs this script or GLTFExporter — only GLTFLoader
// (see popup-marine-asset.ts) loads the checked-in .glb it produces.
import { BoxGeometry, CylinderGeometry, ConeGeometry, Group, Mesh, MeshStandardMaterial, Scene } from "three";
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

function buildMarine() {
  const group = new Group();
  const mat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0.05 });

  const legs = new Mesh(new BoxGeometry(0.34, 0.42, 0.22), mat);
  legs.position.set(0, 0.21, 0);
  const torso = new Mesh(new BoxGeometry(0.36, 0.4, 0.24), mat);
  torso.position.set(0, 0.62, 0);
  const shoulders = new Mesh(new BoxGeometry(0.46, 0.12, 0.26), mat);
  shoulders.position.set(0, 0.82, 0);
  const helmet = new Mesh(new BoxGeometry(0.26, 0.24, 0.28), mat);
  helmet.position.set(0, 1.0, 0.01);
  const visor = new Mesh(new BoxGeometry(0.2, 0.08, 0.04), mat);
  visor.position.set(0, 1.0, 0.15);
  const rifleBody = new Mesh(new BoxGeometry(0.08, 0.08, 0.5), mat);
  rifleBody.position.set(0.24, 0.72, 0.2);
  const rifleBarrel = new Mesh(new CylinderGeometry(0.02, 0.02, 0.3, 6), mat);
  rifleBarrel.rotation.x = Math.PI / 2;
  rifleBarrel.position.set(0.24, 0.72, 0.55);
  const antenna = new Mesh(new ConeGeometry(0.015, 0.16, 4), mat);
  antenna.position.set(0.1, 1.16, -0.02);

  for (const m of [legs, torso, shoulders, helmet, visor, rifleBody, rifleBarrel, antenna]) {
    group.add(m);
  }
  return group;
}

const scene = new Scene();
scene.add(buildMarine());

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
