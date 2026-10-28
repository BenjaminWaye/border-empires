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

it("scales the entire original assembly uniformly without rearranging any components", async () => {
  const original = await load("fishing-style-proposal"), compact = await load("fishing-style-compact");
  const beforeBounds = new Box3().setFromObject(original, true);
  const beforeCenter = beforeBounds.getCenter(new Vector3());
  const afterBounds = new Box3().setFromObject(compact, true);
  const afterCenter = afterBounds.getCenter(new Vector3());
  let checked = 0;
  original.traverse(node => {
    // Compare authored components, not child primitives created for material slots.
    if (!node.name || node.type === "Scene") return;
    const other = compact.getObjectByName(node.name);
    if (!other || new Box3().setFromObject(node, true).isEmpty()) return;
    const before = new Box3().setFromObject(node, true), after = new Box3().setFromObject(other, true);
    const beforeSize = before.getSize(new Vector3()), afterSize = after.getSize(new Vector3());
    const beforeOffset = before.getCenter(new Vector3()).sub(beforeCenter);
    const afterOffset = after.getCenter(new Vector3()).sub(afterCenter);
    for (const axis of ["x", "y", "z"] as const) {
      expect(afterSize[axis]).toBeCloseTo(beforeSize[axis] * 0.8, 5);
      expect(afterOffset[axis]).toBeCloseTo(beforeOffset[axis] * 0.8, 5);
    }
    checked++;
  });
  expect(checked).toBeGreaterThan(50);
  const size = afterBounds.getSize(new Vector3());
  expect(Math.max(size.x, size.z)).toBeLessThan(0.70);
});
