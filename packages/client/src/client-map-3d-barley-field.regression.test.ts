import { describe, expect, it } from "vitest";
import { InstancedMesh, Scene } from "three";
import {
  barleyFieldVariantAt,
  createBarleyFieldOverlay,
  type BarleyFieldVariant
} from "./client-map-3d-barley-field.js";

describe("barley field overlay", () => {
  it("picks only variants 0/1/2 across a sample of tiles", () => {
    for (let x = 0; x < 200; x += 1) {
      for (let z = 0; z < 200; z += 1) {
        const v = barleyFieldVariantAt(x, z);
        expect([0, 1, 2]).toContain(v);
      }
    }
  });

  it("commits visible pieces for every variant", () => {
    const scene = new Scene();
    const overlay = createBarleyFieldOverlay(scene, 3);

    const seen = new Set<BarleyFieldVariant>();
    let tile = 0;
    while (seen.size < 3 && tile < 1000) {
      const v = barleyFieldVariantAt(tile, 0);
      if (!seen.has(v)) {
        overlay.addInstance(tile * 2, 0, 0, tile, 0);
        seen.add(v);
      }
      tile += 1;
    }
    expect(seen.size).toBe(3);

    overlay.commit();

    const renderedPieces = scene.children
      .filter((child): child is InstancedMesh => child instanceof InstancedMesh)
      .reduce((total, mesh) => total + mesh.count, 0);
    expect(renderedPieces).toBeGreaterThan(0);
    // A single tile must paint as a dense carpet (~10x the original sparse
    // crop), not a scattering of stalks — guards against density regressions.
    expect(renderedPieces).toBeGreaterThan(100);

    overlay.dispose();
  });

  it("clears instance counts without removing meshes from the scene", () => {
    const scene = new Scene();
    const overlay = createBarleyFieldOverlay(scene, 1);

    overlay.addInstance(0, 0, 0, 0, 0);
    overlay.commit();
    overlay.clear();
    overlay.commit();

    const renderedPieces = scene.children
      .filter((child): child is InstancedMesh => child instanceof InstancedMesh)
      .reduce((total, mesh) => total + mesh.count, 0);
    expect(renderedPieces).toBe(0);
    expect(scene.children.filter((child) => child instanceof InstancedMesh).length).toBeGreaterThan(0);

    overlay.dispose();
  });
});
