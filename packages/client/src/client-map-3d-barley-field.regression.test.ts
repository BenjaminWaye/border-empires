import { describe, expect, it } from "vitest";
import { InstancedMesh, Matrix4, Quaternion, Scene, Vector3 } from "three";
import {
  barleyFieldVariantAt,
  buildCropTextureData,
  createBarleyFieldOverlay,
  BARLEY_DETAIL_MIN_ZOOM
} from "./client-map-3d-barley-field.js";

const instancedMeshes = (scene: Scene): InstancedMesh[] =>
  scene.children.filter((child): child is InstancedMesh => child instanceof InstancedMesh);

const renderedInstances = (scene: Scene): number =>
  instancedMeshes(scene).reduce((total, mesh) => total + mesh.count, 0);

describe("barley field overlay", () => {
  it("picks only variants 0/1/2 across a sample of tiles", () => {
    for (let x = 0; x < 200; x += 1) {
      for (let z = 0; z < 200; z += 1) {
        expect([0, 1, 2]).toContain(barleyFieldVariantAt(x, z));
      }
    }
  });

  it("draws the crop as a small shell stack rather than per-plant geometry", () => {
    // The crop's density lives in the shell texture's alpha height field, not in instance
    // count. Guards the whole point of shell texturing: a previous implementation emitted
    // ~1,400 sub-pixel cylinders per tile, which is what made this overlay pathological to
    // rasterize. If this number creeps back up, the technique has been undone.
    const scene = new Scene();
    const overlay = createBarleyFieldOverlay(scene, 32);

    overlay.addInstance(0, 0, 0, 5, 5);
    overlay.commit();

    expect(renderedInstances(scene)).toBeLessThanOrEqual(16);

    overlay.dispose();
  });

  it("stacks the shells at strictly increasing heights so the parallax reads as volume", () => {
    const scene = new Scene();
    const overlay = createBarleyFieldOverlay(scene, 32);

    overlay.addInstance(0, 0, 0, 5, 5);
    overlay.commit();

    const matrix = new Matrix4();
    const position = new Vector3();
    const quaternion = new Quaternion();
    const scale = new Vector3();
    const heights: number[] = [];
    for (const mesh of instancedMeshes(scene)) {
      for (let i = 0; i < mesh.count; i += 1) {
        mesh.getMatrixAt(i, matrix);
        matrix.decompose(position, quaternion, scale);
        heights.push(position.y);
      }
    }

    // Distinct stacked layers, all above the ground plane the soil bed sits on.
    const distinct = [...new Set(heights.map((y) => y.toFixed(4)))];
    expect(distinct.length).toBeGreaterThanOrEqual(6);
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(0);

    overlay.dispose();
  });

  it("keeps a farm tile's crop stable across camera-relative origins", () => {
    // rebuildVisibleTerrain() repopulates from an origin that shifts as the camera pans, but a
    // tile's crop orientation and tint are seeded from its world coordinates, so the same tile
    // must paint identically wherever the camera happens to be.
    const scene = new Scene();
    const overlay = createBarleyFieldOverlay(scene, 32);
    const meshes = instancedMeshes(scene);

    const capture = (originX: number, originZ: number): number[] => {
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

    overlay.addInstance(12, 8, 0, 42, 17);
    overlay.commit();
    const first = capture(12, 8);
    expect(first.length).toBeGreaterThan(0);

    overlay.clear();
    overlay.addInstance(-9, 15, 0, 42, 17); // same world tile, different camera-relative origin
    overlay.commit();
    const second = capture(-9, 15);

    expect(second.length).toBe(first.length);
    for (let i = 0; i < first.length; i += 1) {
      expect(second[i]).toBeCloseTo(first[i]!, 5);
    }

    overlay.dispose();
  });

  it("masks the crop into a round patch so the tile is not a square of grain", () => {
    // The tile's silhouette comes entirely from the texture's alpha height field, so "round"
    // means: crop at the centre, nothing in the corners. Runs on the raw texture data rather
    // than a render, so it needs no canvas.
    const size = 256;
    const data = buildCropTextureData({
      dotCount: 2600,
      radiusPx: 2.1,
      salt: 17,
      palette: [[125, 143, 63]]
    });
    const alphaAt = (x: number, y: number): number => data[(y * size + x) * 4 + 3]!;

    // Sample a disc around the centre and the four corner regions.
    let centreCovered = 0;
    let centreSamples = 0;
    let cornerCovered = 0;
    let cornerSamples = 0;
    const half = size / 2;
    for (let y = 0; y < size; y += 2) {
      for (let x = 0; x < size; x += 2) {
        const nd = Math.hypot(x - half, y - half) / half;
        if (nd < 0.45) {
          centreSamples += 1;
          if (alphaAt(x, y) > 0) centreCovered += 1;
        } else if (nd > 0.95) {
          cornerSamples += 1;
          if (alphaAt(x, y) > 0) cornerCovered += 1;
        }
      }
    }

    expect(centreSamples).toBeGreaterThan(0);
    expect(cornerSamples).toBeGreaterThan(0);
    // Corners outside the jittered rim are completely empty — that is the "round" part.
    expect(cornerCovered).toBe(0);
    // The centre stays at full planting density. The mask only changes the patch's footprint,
    // not dots per unit area (dots are scattered uniformly and then clipped to the disc), so
    // this floor catches a regression where the rim creeps inward and thins the whole field.
    expect(centreCovered / centreSamples).toBeGreaterThan(0.35);
  });

  it("thins the crop toward the patch rim instead of ending on a cliff", () => {
    // Height falls off approaching the rim, so the shells (which cut on height) narrow the
    // stack on their own and the patch domes down at its edge.
    const size = 256;
    const half = size / 2;
    const data = buildCropTextureData({
      dotCount: 2600,
      radiusPx: 2.1,
      salt: 17,
      palette: [[125, 143, 63]]
    });

    const meanAlphaInBand = (lo: number, hi: number): number => {
      let total = 0;
      let n = 0;
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          const nd = Math.hypot(x - half, y - half) / half;
          if (nd < lo || nd >= hi) continue;
          total += data[(y * size + x) * 4 + 3]!;
          n += 1;
        }
      }
      return n === 0 ? 0 : total / n;
    };

    expect(meanAlphaInBand(0, 0.3)).toBeGreaterThan(meanAlphaInBand(0.55, 0.7));
    expect(meanAlphaInBand(0.55, 0.7)).toBeGreaterThan(meanAlphaInBand(0.8, 0.95));
  });

  it("does not allocate instance capacity proportional to per-plant geometry", () => {
    // Regression guard for the GPU blowup: caps were sized maxTiles (14,000) * ~300 pieces,
    // i.e. assuming every visible tile could simultaneously be a max-density farm tile. An
    // InstancedMesh eagerly allocates cap * 16 float32s for its matrix buffer on the CPU heap
    // and mirrors it in VRAM, so that reserved ~1.33 GB for this one overlay.
    const scene = new Scene();
    const overlay = createBarleyFieldOverlay(scene, 14_000);

    const totalBytes = instancedMeshes(scene).reduce(
      (total, mesh) => total + mesh.instanceMatrix.array.length * 4,
      0
    );
    expect(totalBytes).toBeLessThan(32 * 1024 * 1024);

    overlay.dispose();
  });

  it("uploads only the instances actually used, not the whole buffer", () => {
    // Without an update range three.js does gl.bufferSubData(target, 0, array) — the entire
    // capacity — every time needsUpdate is set, however few instances are drawn. That upload
    // happens inside renderer.render(), so it never appears in this module's own timings; the
    // only way to keep it honest is to assert the range is scoped to the usage.
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

  it("falls back to a single golden canopy — not bare soil — when zoomed out", () => {
    // A field seen from altitude reads as golden grain; dropping to the dark soil bed alone
    // made distant farmland look like mud. The far LOD keeps one near-solid canopy plane over
    // the bed, and must stay cheaper than the full stack.
    const scene = new Scene();
    const overlay = createBarleyFieldOverlay(scene, 32);

    overlay.setDetailEnabled(true);
    overlay.addInstance(0, 0, 0, 5, 5);
    overlay.commit();
    const detailed = renderedInstances(scene);

    overlay.clear();
    overlay.setDetailEnabled(false);
    overlay.addInstance(0, 0, 0, 5, 5);
    overlay.commit();
    const far = renderedInstances(scene);

    expect(far).toBeLessThan(detailed);
    // Soil bed (2 mounds) plus exactly one canopy plane covering it.
    expect(far).toBe(3);

    overlay.dispose();
  });

  it("keeps the detail-zoom floor below the zoom range real play sits in", () => {
    // Observed play zoom is ~64-160; the floor only exists to stop building sub-pixel canopy
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
});
