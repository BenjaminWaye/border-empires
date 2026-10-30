import { BufferAttribute, BufferGeometry, Color, Group, Mesh, MeshStandardMaterial } from "three";
import { describe, expect, it, vi } from "vitest";
import { loadMergedGlbGeometry } from "./client-map-3d-merged-glb.js";

let scene: Group;
vi.mock("three/examples/jsm/loaders/GLTFLoader.js", () => ({
  GLTFLoader: class {
    load(_url: string, onLoad: (gltf: { scene: Group }) => void): void { onLoad({ scene }); }
  }
}));

const triangle = (): BufferGeometry => {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1]), 3));
  geometry.computeVertexNormals();
  return geometry;
};

describe("food tile merged geometry", () => {
  it("preserves baked shading multiplied by the material colour and keeps surface UVs", async () => {
    scene = new Group();
    const geometry = triangle();
    geometry.setAttribute("color", new BufferAttribute(new Float32Array([0.5, 0.6, 0.7, 1, 1, 1, 0.7, 0.7, 0.7]), 3));
    geometry.setAttribute("uv", new BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1]), 2));
    scene.add(new Mesh(geometry, new MeshStandardMaterial({ color: new Color(0.8, 0.5, 0.3) })));
    const merged = await loadMergedGlbGeometry("food.glb");
    expect(merged.getAttribute("color").getX(0)).toBeCloseTo(0.4);
    expect(merged.getAttribute("color").getY(0)).toBeCloseTo(0.3);
    expect(merged.getAttribute("color").getZ(0)).toBeCloseTo(0.21);
    expect(Array.from(merged.getAttribute("uv").array)).toEqual([0, 0, 1, 0, 0, 1]);
  });

  it("merges older untextured meshes with textured meshes", async () => {
    scene = new Group();
    const textured = triangle();
    textured.setAttribute("uv", new BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1]), 2));
    scene.add(new Mesh(textured, new MeshStandardMaterial()), new Mesh(triangle(), new MeshStandardMaterial()));
    const merged = await loadMergedGlbGeometry("mixed.glb");
    expect(merged.getAttribute("position").count).toBe(6);
    expect(merged.getAttribute("uv").count).toBe(6);
    expect(merged.getAttribute("color").getX(5)).toBe(1);
  });
});
