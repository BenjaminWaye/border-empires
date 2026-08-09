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

    // Captures both relative position and rotation (quaternion) — rotation is now cached and
    // reapplied via a stored quaternion rather than recomputed from Euler angles on every call
    // (see placePiece), so this also guards that refactor produced the identical rotations.
    const captureRelativePositions = (originX: number, originZ: number): number[] => {
      const values: number[] = [];
      const matrix = new Matrix4();
      const position = new Vector3();
      const quaternion = new Quaternion();
      const scale = new Vector3();
      for (const mesh of meshes) {
        for (let i = 0; i < mesh.count; i += 1) {
          mesh.getMatrixAt(i, matrix);
          matrix.decompose(position, quaternion, scale);
          values.push(position.x - originX, position.y, position.z - originZ, quaternion.x, quaternion.y, quaternion.z, quaternion.w);
        }
      }
      return values;
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

  it("does not allocate instance capacity proportional to every visible tile", () => {
    // Regression guard for the GPU blowup: caps were sized maxTiles (14,000) * ~300 pieces,
    // i.e. assuming every visible tile could simultaneously be a max-density farm tile. An
    // InstancedMesh eagerly allocates cap * 16 float32s for its matrix buffer on the CPU heap
    // and mirrors it in VRAM, so that sized ~1.33 GB of buffers for this one overlay — roughly
    // 100x the largest other 3D overlay in the codebase, and enough to wedge a mobile GPU.
    const scene = new Scene();
    const overlay = createBarleyFieldOverlay(scene, 14_000);

    const totalBytes = scene.children
      .filter((child): child is InstancedMesh => child instanceof InstancedMesh)
      .reduce((total, mesh) => total + mesh.instanceMatrix.array.length * 4, 0);

    // Comfortably above the real requirement (~61 MB) and far below the ~1.33 GB regression.
    expect(totalBytes).toBeLessThan(150 * 1024 * 1024);

    overlay.dispose();
  });

  it("uploads only the instances actually used, not the whole buffer", () => {
    // Without an update range three.js does gl.bufferSubData(target, 0, array) — the entire
    // capacity — every time needsUpdate is set, regardless of how few instances are drawn.
    // That upload happens inside renderer.render(), so it never appears in this module's own
    // timings; the only way to keep it honest is to assert the range is scoped to the usage.
    const scene = new Scene();
    const overlay = createBarleyFieldOverlay(scene, 14_000);

    overlay.addInstance(0, 0, 0, 5, 5);
    overlay.commit();

    const meshes = scene.children.filter((child): child is InstancedMesh => child instanceof InstancedMesh);
    const drawn = meshes.filter((mesh) => mesh.count > 0);
    expect(drawn.length).toBeGreaterThan(0);

    for (const mesh of drawn) {
      const ranges = mesh.instanceMatrix.updateRanges;
      expect(ranges).toHaveLength(1);
      // Exactly the used instances (16 floats per mat4), never the full allocated array.
      expect(ranges[0]).toEqual({ start: 0, count: mesh.count * 16 });
      expect(ranges[0]!.count).toBeLessThan(mesh.instanceMatrix.array.length);
    }

    overlay.dispose();
  });

  it("still draws a soil bed for farm tiles past the crop-detail budget", () => {
    // The crop budget degrades to soil-only rather than dropping the tile entirely, so a farm
    // tile never blinks out of existence in the worst case.
    const scene = new Scene();
    const overlay = createBarleyFieldOverlay(scene, 14_000);
    overlay.setDetailEnabled(false);

    overlay.addInstance(0, 0, 0, 5, 5);
    overlay.commit();

    const rendered = scene.children
      .filter((child): child is InstancedMesh => child instanceof InstancedMesh)
      .reduce((total, mesh) => total + mesh.count, 0);
    // Soil bed only (two overlapping mounds) — present, but not the ~1,400-piece carpet.
    expect(rendered).toBe(2);

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
