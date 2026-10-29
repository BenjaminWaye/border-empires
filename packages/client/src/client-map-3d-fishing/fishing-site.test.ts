import { readFileSync } from "node:fs";
import { Box3, InstancedMesh, Matrix4, MeshStandardMaterial, Scene, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { expect, it, vi } from "vitest";
import { createFishingOverlay } from "./client-map-3d-fishing.js";
import { FISHING_MODEL_URL, loadFishingLayers } from "./fishing-model-layers.js";

it("renders the approved small assembly in bounded layers, moves its apron with it and disposes safely", async () => {
  const bytes = readFileSync(new URL(`../../public${FISHING_MODEL_URL}`, import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length), "");
  const originalBounds = new Box3().setFromObject(gltf.scene, true);
  const loader = vi.spyOn(GLTFLoader.prototype, "loadAsync").mockResolvedValue(gltf);
  const scene = new Scene();
  const overlay = createFishingOverlay(scene, 1, undefined, () => 0.1);
  overlay.addInstance(0.5, 0.5, 0.18, 100, 100, { dx: 1, dy: 0 });
  overlay.addInstance(5, 5, 0.18, 105, 105);
  overlay.commit();
  const layers = await loadFishingLayers();
  await Promise.resolve();
  expect(layers.map(layer => layer.layer).sort()).toEqual(["body", "metal", "water"]);
  expect(scene.children).toHaveLength(4);
  const bounds = new Box3();
  for (const { geometry } of layers) bounds.union(geometry.boundingBox!);
  expect(bounds.getSize(new Vector3()).distanceTo(originalBounds.getSize(new Vector3()))).toBeLessThan(0.00001);
  expect(Math.max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z)).toBeLessThan(0.7);
  for (const object of scene.children) {
    expect(object).toBeInstanceOf(InstancedMesh);
    const mesh = object as InstancedMesh;
    expect(mesh.count).toBe(1);
    const matrix = new Matrix4(); mesh.getMatrixAt(0, matrix);
    const position = new Vector3().setFromMatrixPosition(matrix);
    expect(position.x).toBeCloseTo(0.632);
    expect(position.z).toBeCloseTo(0.5);
    if (mesh.name === "fishing-clean-apron") {
      const placed = new Box3().setFromBufferAttribute(mesh.geometry.getAttribute("position")).applyMatrix4(matrix);
      expect(placed.max.x).toBeCloseTo(1);
      const material = mesh.material as MeshStandardMaterial;
      expect(material.map).toBeNull();
      expect(material.color.getHexString()).toBe("858880");
    }
  }
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    overlay.clear(); overlay.addInstance(0.5, 0.5, 0.18, 100, 100, { dx: dx!, dy: dy! }); overlay.commit();
    const apron = scene.children.find(object => object.name === "fishing-clean-apron") as InstancedMesh;
    const matrix = new Matrix4(); apron.getMatrixAt(0, matrix);
    const positions = apron.geometry.getAttribute("position");
    for (let i = 0; i < positions.count; i++) {
      const point = new Vector3().fromBufferAttribute(positions, i).applyMatrix4(matrix);
      expect(point.x).toBeGreaterThanOrEqual(-0.00001); expect(point.x).toBeLessThanOrEqual(1.00001);
      expect(point.z).toBeGreaterThanOrEqual(-0.00001); expect(point.z).toBeLessThanOrEqual(1.00001);
    }
  }
  overlay.clear(); overlay.commit();
  for (const object of scene.children) expect((object as InstancedMesh).count).toBe(0);
  overlay.dispose(); expect(scene.children).toHaveLength(0);
  const abandoned = createFishingOverlay(scene, 1);
  abandoned.dispose(); await Promise.resolve();
  expect(scene.children).toHaveLength(0);
  loader.mockRestore();
});
