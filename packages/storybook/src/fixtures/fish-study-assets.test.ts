import { readFileSync } from "node:fs";
import { Box3, Vector3, type Object3D } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { expect, it } from "vitest";

const load = async (name: string): Promise<Object3D> => {
  const bytes = readFileSync(new URL(`../../public/studies/${name}.glb`, import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length), "");
  gltf.scene.updateMatrixWorld(true);
  return gltf.scene;
};

it("tightens the site without scaling down either original holding basin", async () => {
  const original = await load("fishing-style-proposal"), compact = await load("fishing-style-compact");
  const basins = (root: Object3D): Vector3[] => {
    const sizes: Vector3[] = [];
    root.traverse(node => {
      if (node.name.startsWith("Cylinder") && !node.parent?.name.startsWith("Cylinder")) {
        sizes.push(new Box3().setFromObject(node, true).getSize(new Vector3()));
      }
    });
    return sizes;
  };
  const before = basins(original), after = basins(compact);
  expect(before).toHaveLength(2);
  expect(after).toHaveLength(2);
  for (let i = 0; i < 2; i++) for (const axis of ["x", "y", "z"] as const) expect(after[i]?.[axis]).toBeCloseTo(before[i]?.[axis] ?? 0, 5);
  const bounds = new Box3().setFromObject(compact, true).getSize(new Vector3());
  expect(Math.max(bounds.x, bounds.z)).toBeLessThan(0.69);
});
