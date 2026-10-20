import { describe, expect, it } from "vitest";
import { Color, InstancedMesh, Matrix4, Quaternion, Scene, ShaderLib, Vector3, type BufferGeometry } from "three";
import { createForest } from "./client-map-3d-forest.js";
import { createTreeMaterial } from "./client-map-3d-tree-material.js";
import { createLeafGeometry, createPalmGeometry, createPineGeometry, createSpruceGeometry } from "./client-map-3d-tree-models.js";
import { composeTreeInstance } from "./client-map-3d-tree-variation.js";

const MODELS: ReadonlyArray<readonly [string, () => BufferGeometry]> = [
  ["pine", createPineGeometry],
  ["spruce", createSpruceGeometry],
  ["leaf", createLeafGeometry],
  ["palm", createPalmGeometry]
];

describe("hand-built tree models", () => {
  for (const [name, build] of MODELS) {
    it(`${name}: one merged trunk + canopy, rooted below the ground, swaying only at the crown`, () => {
      const geometry = build();
      const positions = geometry.getAttribute("position");
      const sway = geometry.getAttribute("aTreeSway");
      const foliage = geometry.getAttribute("aTreeFoliage");
      expect(geometry.getAttribute("color").count).toBe(positions.count);
      expect(positions.count % 3).toBe(0);
      // A cheap budget: thousands of these are drawn twice (colour + shadow).
      expect(positions.count / 3).toBeLessThanOrEqual(120);
      geometry.computeBoundingBox();
      expect(geometry.boundingBox!.min.y).toBeLessThan(0);
      let bark = 0;
      let leaves = 0;
      for (let i = 0; i < positions.count; i += 1) {
        if (positions.getY(i) <= 0) expect(sway.getX(i)).toBe(0);
        expect(sway.getX(i)).toBeLessThanOrEqual(1);
        if (foliage.getX(i) > 0) leaves += 1;
        else bark += 1;
      }
      expect(bark).toBeGreaterThan(0);
      expect(leaves).toBeGreaterThan(0);
      geometry.dispose();
    });
  }
});

describe("composeTreeInstance", () => {
  const yawOf = (matrix: Matrix4): number => {
    const q = new Quaternion();
    matrix.decompose(new Vector3(), q, new Vector3());
    const forward = new Vector3(1, 0, 0).applyQuaternion(q);
    return Math.atan2(forward.z, forward.x);
  };

  it("turns each tree of a tile its own way and shades it its own colour", () => {
    const matrix = new Matrix4();
    const color = new Color();
    const yaws = new Set<string>();
    const shades = new Set<string>();
    for (let slot = 0; slot < 9; slot += 1) {
      composeTreeInstance({ x: 0, y: 0, z: 0, scale: 1, worldX: 12, worldZ: 34, slot, tint: undefined }, matrix, color);
      yaws.add(yawOf(matrix).toFixed(2));
      shades.add(`${color.r.toFixed(3)},${color.b.toFixed(3)}`); // raw: shades run past 1, where a hex string clamps
    }
    expect(yaws.size).toBeGreaterThan(6);
    expect(shades.size).toBeGreaterThan(6);
  });

  it("keeps trees upright-ish and close to their layout size", () => {
    const matrix = new Matrix4();
    const color = new Color();
    const up = new Vector3();
    const scale = new Vector3();
    for (let worldX = 0; worldX < 40; worldX += 1) {
      composeTreeInstance({ x: 0, y: 0, z: 0, scale: 1, worldX, worldZ: worldX * 3, slot: worldX % 9, tint: undefined }, matrix, color);
      const q = new Quaternion();
      matrix.decompose(new Vector3(), q, scale);
      up.set(0, 1, 0).applyQuaternion(q);
      expect(up.y).toBeGreaterThan(Math.cos(0.08));
      expect(scale.y).toBeGreaterThan(0.9);
      expect(scale.y).toBeLessThan(1.1);
    }
  });

  it("places a forest tile's trees with that per-tree variation", () => {
    const scene = new Scene();
    const forest = createForest(scene, 1);
    forest.addInstance(0, 0, 0, 5, 5);
    forest.commit();
    const mesh = scene.children.find((c): c is InstancedMesh => c instanceof InstancedMesh && c.count > 0)!;
    const yaws = new Set<string>();
    const matrix = new Matrix4();
    for (let i = 0; i < mesh.count; i += 1) {
      mesh.getMatrixAt(i, matrix);
      yaws.add(yawOf(matrix).toFixed(2));
    }
    expect(yaws.size).toBeGreaterThan(mesh.count / 2);
    forest.dispose();
  });
});

describe("tree material", () => {
  it("adds the wind sway and foliage rim light to the standard shader", () => {
    const material = createTreeMaterial();
    const shader = {
      uniforms: {},
      vertexShader: ShaderLib.physical.vertexShader,
      fragmentShader: ShaderLib.physical.fragmentShader
    };
    material.onBeforeCompile(shader as unknown as Parameters<typeof material.onBeforeCompile>[0], undefined as unknown as Parameters<typeof material.onBeforeCompile>[1]);
    expect(shader.vertexShader).toContain("aTreeSway");
    expect(shader.vertexShader).toContain("uTreeWindTime");
    expect(shader.fragmentShader).toContain("treeRim");
    expect(shader.uniforms).toHaveProperty("uTreeWindTime");
    expect(material.vertexColors).toBe(true);
    material.dispose();
  });
});
