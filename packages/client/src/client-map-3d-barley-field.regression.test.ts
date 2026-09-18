import { describe, expect, it } from "vitest";
import { InstancedMesh, Matrix4, Quaternion, Scene, Vector3 } from "three";
import { barleyFieldVariantAt, createBarleyFieldOverlay, BARLEY_DETAIL_MIN_ZOOM } from "./client-map-3d-barley-field.js";

// The baked model loads over HTTP (GLTFLoader.load), which this test environment cannot serve,
// so every case here exercises the synchronous far-LOD plane — the path the overlay falls back to
// whenever the detail mesh hasn't (yet, or ever) finished loading. See
// client-map-3d-emerald-crop-field-model.test.ts for coverage of the real checked-in asset itself.

const instancedMeshes = (scene: Scene): InstancedMesh[] =>
  scene.children.filter((child): child is InstancedMesh => child instanceof InstancedMesh);

const renderedInstances = (scene: Scene): number =>
  instancedMeshes(scene).reduce((total, mesh) => total + mesh.count, 0);

describe("emerald crop field overlay", () => {
  it("picks only variants 0/1/2 across a sample of tiles", () => {
    for (let x = 0; x < 200; x += 1) {
      for (let z = 0; z < 200; z += 1) {
        expect([0, 1, 2]).toContain(barleyFieldVariantAt(x, z));
      }
    }
  });

  it("preallocates exactly one InstancedMesh per LOD level, not one per plant piece", () => {
    // The old shell-texturing implementation preallocated 10 InstancedMeshes (8 shells + 2 soil
    // mounds) at the tile budget. Replacing per-tile procedural geometry with one baked model
    // means one draw call per LOD level (far plane now, detail mesh once it loads) — guards
    // against that regressing back toward many meshes per tile.
    const scene = new Scene();
    const overlay = createBarleyFieldOverlay(scene, 32);

    // Only the far-LOD plane exists synchronously; the detail mesh is added once the (here,
    // unreachable) network load resolves.
    expect(instancedMeshes(scene)).toHaveLength(1);

    overlay.dispose();
  });

  it("renders a placed tile through the far-LOD plane while the detail mesh isn't ready", () => {
    const scene = new Scene();
    const overlay = createBarleyFieldOverlay(scene, 32);

    overlay.addInstance(0, 0, 0, 5, 5);
    overlay.commit();

    expect(renderedInstances(scene)).toBe(1);

    overlay.dispose();
  });

  it("keeps a farm tile's placement stable across camera-relative origins", () => {
    // rebuildVisibleTerrain() repopulates from an origin that shifts as the camera pans, but a
    // tile's rotation is seeded from its world coordinates, so the same tile must place
    // identically wherever the camera happens to be.
    const scene = new Scene();
    const overlay = createBarleyFieldOverlay(scene, 32);
    const mesh = instancedMeshes(scene)[0]!;

    const capture = (originX: number, originZ: number): number[] => {
      const matrix = new Matrix4();
      const position = new Vector3();
      const quaternion = new Quaternion();
      const scale = new Vector3();
      mesh.getMatrixAt(0, matrix);
      matrix.decompose(position, quaternion, scale);
      return [position.x - originX, position.z - originZ, quaternion.x, quaternion.y, quaternion.z, quaternion.w];
    };

    overlay.addInstance(12, 8, 0, 42, 17);
    overlay.commit();
    const first = capture(12, 8);

    overlay.clear();
    overlay.addInstance(-9, 15, 0, 42, 17); // same world tile, different camera-relative origin
    overlay.commit();
    const second = capture(-9, 15);

    for (let i = 0; i < first.length; i += 1) {
      expect(second[i]).toBeCloseTo(first[i]!, 5);
    }

    overlay.dispose();
  });

  it("does not allocate instance capacity proportional to per-plant geometry", () => {
    // Regression guard for the GPU blowup the old shell stack risked: 10 meshes * maxTiles * 16
    // floats each. This overlay allocates far fewer meshes, so the same tile budget should cost
    // far less CPU/GPU buffer memory.
    const scene = new Scene();
    const overlay = createBarleyFieldOverlay(scene, 14_000);

    const totalBytes = instancedMeshes(scene).reduce((total, mesh) => total + mesh.instanceMatrix.array.length * 4, 0);
    expect(totalBytes).toBeLessThan(4 * 1024 * 1024);

    overlay.dispose();
  });

  it("uploads only the instances actually used, not the whole buffer", () => {
    // Without an update range three.js does gl.bufferSubData(target, 0, array) — the entire
    // capacity — every time needsUpdate is set, however few instances are drawn.
    const scene = new Scene();
    const overlay = createBarleyFieldOverlay(scene, 14_000);

    overlay.addInstance(0, 0, 0, 5, 5);
    overlay.commit();

    const drawn = instancedMeshes(scene).filter((mesh) => mesh.count > 0);
    expect(drawn.length).toBeGreaterThan(0);
    for (const mesh of drawn) {
      const ranges = mesh.instanceMatrix.updateRanges;
      expect(ranges).toHaveLength(1);
      expect(ranges[0]).toEqual({ start: 0, count: mesh.count * 16 });
      expect(ranges[0]!.count).toBeLessThan(mesh.instanceMatrix.array.length);
    }

    overlay.dispose();
  });

  it("keeps the detail-zoom floor below the zoom range real play sits in", () => {
    // Observed play zoom is ~64-160; the floor only exists to stop drawing the full-detail model
    // when the player zooms all the way out, never to degrade a normal view.
    expect(BARLEY_DETAIL_MIN_ZOOM).toBeLessThan(64);
  });

  it("clears instance counts without removing meshes from the scene", () => {
    const scene = new Scene();
    const overlay = createBarleyFieldOverlay(scene, 32);

    overlay.addInstance(0, 0, 0, 0, 0);
    overlay.commit();
    expect(renderedInstances(scene)).toBeGreaterThan(0);

    overlay.clear();
    overlay.commit();
    expect(renderedInstances(scene)).toBe(0);
    expect(instancedMeshes(scene).length).toBeGreaterThan(0);

    overlay.dispose();
  });

  it("removes its meshes from the scene on dispose", () => {
    const scene = new Scene();
    const overlay = createBarleyFieldOverlay(scene, 32);
    expect(instancedMeshes(scene).length).toBeGreaterThan(0);

    overlay.dispose();
    expect(instancedMeshes(scene).length).toBe(0);
  });
});
