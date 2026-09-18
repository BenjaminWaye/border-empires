// @vitest-environment happy-dom
// Regression coverage for the real checked-in emerald-crop-field model, parsed straight off disk
// (GLTFLoader.parse on the raw bytes, no network fetch). client-map-3d-barley-field.ts loads this
// same file over HTTP at runtime, which vitest cannot exercise, so this file is what actually
// touches the real asset — see popup-marine-asset.test.ts for the same pattern on that model.
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { Mesh } from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODEL_PATH = resolve(__dirname, "../public/models/emerald-crop-field.glb");

const parseModel = (): Promise<GLTF> => {
  const bytes = readFileSync(MODEL_PATH);
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new Promise((res, rej) => {
    new GLTFLoader().parse(arrayBuffer, "", res, rej);
  });
};

describe("emerald-crop-field.glb (real checked-in asset)", () => {
  it("stays baked down — regression guard against re-checking-in the raw Meshy export", () => {
    // The raw Meshy export is 24.6MB (2048x2048 base color + normal, a 4096x4096
    // metallic-roughness map). bake-emerald-crop-field-model.sh brings it to ~730KB. If this
    // creeps back toward multi-megabyte territory, someone committed the unbaked file.
    const { size } = statSync(MODEL_PATH);
    expect(size).toBeLessThan(2 * 1024 * 1024);
  });

  it("parses to exactly one mesh", async () => {
    const gltf = await parseModel();
    const meshes: Mesh[] = [];
    gltf.scene.traverse((o) => {
      if (o instanceof Mesh) meshes.push(o);
    });
    expect(meshes).toHaveLength(1);
  });

  it("has a roughly flat, roughly square footprint (a tile plane, not a tall prop)", async () => {
    const gltf = await parseModel();
    let mesh: Mesh | undefined;
    gltf.scene.traverse((o) => {
      if (!mesh && o instanceof Mesh) mesh = o;
    });
    mesh!.geometry.computeBoundingBox();
    const box = mesh!.geometry.boundingBox!;
    const width = box.max.x - box.min.x;
    const depth = box.max.z - box.min.z;
    const height = box.max.y - box.min.y;
    // Width and depth are within the same order of magnitude of each other...
    expect(Math.max(width, depth) / Math.min(width, depth)).toBeLessThan(1.5);
    // ...and much wider/deeper than it is tall, confirming this is a ground-hugging tile mesh
    // that client-map-3d-barley-field.ts can safely normalize by its XZ footprint alone.
    expect(height).toBeLessThan(Math.min(width, depth) * 0.25);
  });

  it("keeps geometry small enough for a per-farm-tile InstancedMesh", async () => {
    const gltf = await parseModel();
    let mesh: Mesh | undefined;
    gltf.scene.traverse((o) => {
      if (!mesh && o instanceof Mesh) mesh = o;
    });
    const positionCount = mesh!.geometry.attributes.position!.count;
    // A few thousand farm tiles could be visible at once at the tile budget; keep any single
    // instance's vertex cost low enough that instancing it doesn't dominate the vertex shader.
    expect(positionCount).toBeLessThan(20_000);
  });
});
