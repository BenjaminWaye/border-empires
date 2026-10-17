import { describe, expect, it } from "vitest";
import { InstancedMesh, Matrix4, Scene, Vector3 } from "three";
import { createAetherProtectionEdgeOverlay } from "./client-map-3d-aether-protection-edges.js";

describe("3D Aether protection outline", () => {
  it("places one flat strip per outer side, inside the tile, rotated for east/west sides", () => {
    const scene = new Scene();
    const overlay = createAetherProtectionEdgeOverlay(scene, 16);
    overlay.addTile({ north: true, east: true, south: false, west: false }, 10.5, 20.5, 1, "#ff4d6d");
    overlay.commit();
    const mesh = scene.children.find((child): child is InstancedMesh => child instanceof InstancedMesh)!;
    expect(mesh.count).toBe(2);
    const at = (i: number): Vector3 => {
      const m = new Matrix4();
      mesh.getMatrixAt(i, m);
      return new Vector3().setFromMatrixPosition(m);
    };
    expect(at(0).x).toBeCloseTo(10.5);
    expect(at(0).z).toBeCloseTo(20.05); // north strip hugs the tile's north edge
    expect(at(1).x).toBeCloseTo(10.95); // east strip hugs the east edge
    expect(at(1).z).toBeCloseTo(20.5);
    overlay.clear();
    overlay.commit();
    expect(mesh.count).toBe(0);
    overlay.dispose();
    expect(scene.children).toHaveLength(0);
  });
});
