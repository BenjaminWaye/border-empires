import { describe, expect, it } from "vitest";
import { InstancedMesh, Matrix4, Quaternion, Scene, Vector3 } from "three";
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

  it("paints the same world tile with an identical relative layout regardless of the camera-relative origin it's called with", () => {
    // rebuildVisibleTerrain() rebuilds the visible window's overlays from a camera-relative
    // origin that shifts as the camera pans, but a farm tile's specific plant layout is cached
    // and keyed by world coordinates — it must come out identical every time regardless of
    // where the camera happens to be, matching this module's documented "stable across frames"
    // guarantee. (Before caching, the RNG was seeded from the camera-relative scene position
    // passed into addInstance, so this same test would have failed: the same world tile would
    // repaint with a different random layout every time the camera moved.)
    const scene = new Scene();
    const overlay = createBarleyFieldOverlay(scene, 2);
    const meshes = scene.children.filter((child): child is InstancedMesh => child instanceof InstancedMesh);

    const captureRelativePositions = (originX: number, originZ: number): number[] => {
      const positions: number[] = [];
      const matrix = new Matrix4();
      const position = new Vector3();
      const quaternion = new Quaternion();
      const scale = new Vector3();
      for (const mesh of meshes) {
        for (let i = 0; i < mesh.count; i += 1) {
          mesh.getMatrixAt(i, matrix);
          matrix.decompose(position, quaternion, scale);
          positions.push(position.x - originX, position.y, position.z - originZ);
        }
      }
      return positions;
    };

    // Origins stay small (like real camera-relative scene coordinates, typically a few dozen
    // tiles from the camera) rather than large arbitrary numbers — InstancedMesh matrices are
    // float32, so subtracting a large origin back out of a large absolute position reintroduces
    // float32 rounding noise unrelated to the thing under test.
    overlay.addInstance(12, 8, 0, 42, 17);
    overlay.commit();
    const first = captureRelativePositions(12, 8);
    expect(first.length).toBeGreaterThan(0);

    overlay.clear();
    overlay.addInstance(-9, 15, 0, 42, 17); // same world tile, different scene-relative origin
    overlay.commit();
    const second = captureRelativePositions(-9, 15);

    expect(second.length).toBe(first.length);
    for (let i = 0; i < first.length; i += 1) {
      expect(second[i]).toBeCloseTo(first[i]!, 5);
    }

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
