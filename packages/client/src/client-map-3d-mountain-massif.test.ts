import { describe, expect, it } from "vitest";
import { InstancedMesh, Matrix4, Scene, Vector3 } from "three";
import { createMountainMassifs, type MountainMassifDeps } from "./client-map-3d-mountain-massif.js";
import { LONE_MOUNTAIN_LOOKUP } from "./client-map-3d-mountain-massif.test-helpers.js";
import { mountainNeighbourhoodAt, mountainVariationAt } from "./client-map-mountain-variation/client-map-mountain-variation.js";
import { MOUNTAIN_HEIGHT, mountainShapeHeight } from "./client-map-3d-mountain-shape.js";

const matricesOf = (mesh: InstancedMesh): Matrix4[] =>
  Array.from({ length: mesh.count }, (_, i) => {
    const m = new Matrix4();
    mesh.getMatrixAt(i, m);
    return m;
  });

const rangeLookup = (mountains: ReadonlySet<string>, cold = false): MountainMassifDeps => ({
  isMountainAt: (x, y) => mountains.has(`${x},${y}`),
  isColdAt: () => cold,
  wrapX: (x) => x,
  wrapY: (y) => y
});

const allMatrices = (meshes: readonly InstancedMesh[]): Matrix4[] => meshes.flatMap(matricesOf);

describe("mountain massif", () => {
  it("keys the look on the world tile, so panning the camera never reshapes a mountain", () => {
    const shapeAt = (sceneX: number, sceneZ: number): number[][] => {
      const scene = new Scene();
      const massifs = createMountainMassifs(scene, 2, LONE_MOUNTAIN_LOOKUP);
      massifs.addInstance(sceneX, sceneZ, 0.3, 40, 12);
      massifs.commit();
      const shape = allMatrices(massifs.meshes).map((m) =>
        m.elements.map((v, i) => (i === 12 ? v - sceneX : i === 14 ? v - sceneZ : v)).map((v) => Math.round(v * 1e6) / 1e6)
      );
      massifs.dispose();
      return shape;
    };
    expect(shapeAt(3, -2)).toEqual(shapeAt(-17, 9));
  });

  it("varies mountain height between tiles and uses several shapes", () => {
    const heights = new Set<number>();
    const shapes = new Set<number>();
    for (let i = 0; i < 16; i += 1) {
      const scene = new Scene();
      const massifs = createMountainMassifs(scene, 2, LONE_MOUNTAIN_LOOKUP);
      massifs.addInstance(0, 0, 0, i, i * 5);
      massifs.commit();
      massifs.meshes.forEach((mesh, s) => {
        if (mesh.count === 0) return;
        shapes.add(s);
        heights.add(Math.round(new Vector3().setFromMatrixScale(matricesOf(mesh)[0]!).y * 1000));
      });
      massifs.dispose();
    }
    expect(heights.size).toBeGreaterThan(6);
    expect(shapes.size).toBeGreaterThan(2);
  });

  it("adds second peaks and saddles for a range, never more snow than peaks", () => {
    const mountains = new Set<string>();
    for (let x = 0; x < 6; x += 1) for (let y = 0; y < 3; y += 1) mountains.add(`${x},${y}`);
    const lookup = rangeLookup(mountains);
    const scene = new Scene();
    const massifs = createMountainMassifs(scene, mountains.size, lookup);
    let expected = 0;
    for (const key of mountains) {
      const [x, y] = key.split(",").map(Number) as [number, number];
      massifs.addInstance(x, y, 0, x, y);
      const v = mountainVariationAt(x, y, mountainNeighbourhoodAt(x, y, lookup));
      expected += 1 + Number(v.secondary !== null) + Number(v.saddleEast) + Number(v.saddleSouth);
    }
    massifs.commit();
    // 5 east-west pairs per row x 3 rows + 6 columns x 2 north-south pairs.
    expect(expected).toBeGreaterThanOrEqual(mountains.size + 15 + 12);
    expect(massifs.instanceCount()).toBeLessThanOrEqual(expected);
    expect(massifs.instanceCount()).toBeGreaterThan(mountains.size + 20);
    expect(massifs.snowyInstanceCount()).toBeLessThanOrEqual(massifs.instanceCount());
    massifs.dispose();
  });

  it("snows on every mountain in cold country, only tall ones elsewhere", () => {
    const count = (cold: boolean): number => {
      const scene = new Scene();
      const massifs = createMountainMassifs(scene, 30, rangeLookup(new Set(), cold));
      for (let i = 0; i < 30; i += 1) massifs.addInstance(i * 2, 0, 0, i * 3, i);
      massifs.commit();
      const n = massifs.snowyInstanceCount();
      massifs.dispose();
      return n;
    };
    expect(count(true)).toBeGreaterThanOrEqual(30);
    expect(count(false)).toBeLessThan(30);
    expect(count(false)).toBeGreaterThan(0);
  });

  it("clears back to zero instances", () => {
    const scene = new Scene();
    const massifs = createMountainMassifs(scene, 4, LONE_MOUNTAIN_LOOKUP);
    massifs.addInstance(0, 0, 0, 1, 1);
    massifs.commit();
    massifs.clear();
    massifs.commit();
    expect(massifs.instanceCount()).toBe(0);
    massifs.dispose();
  });
});

describe("mountain shape", () => {
  it("peaks near the centre at about MOUNTAIN_HEIGHT and sinks below the ground at its rim", () => {
    for (let seed = 1; seed <= 4; seed += 1) {
      const summit = mountainShapeHeight({ seed }, 0, 0);
      expect(summit).toBeGreaterThan(MOUNTAIN_HEIGHT * 0.8);
      expect(summit).toBeLessThanOrEqual(MOUNTAIN_HEIGHT * 1.15);
      expect(mountainShapeHeight({ seed }, 0.74, 0)).toBeLessThan(0);
      expect(mountainShapeHeight({ seed }, 0, 0.3)).toBeGreaterThan(0);
    }
  });

  it("has ridges and creases (not a smooth cone)", () => {
    const ring = Array.from({ length: 64 }, (_, k) => mountainShapeHeight({ seed: 2 }, Math.sin((k / 64) * Math.PI * 2) * 0.35, Math.cos((k / 64) * Math.PI * 2) * 0.35));
    expect(Math.max(...ring) - Math.min(...ring)).toBeGreaterThan(0.08);
  });

  it("cuts a gully down the +z side when asked", () => {
    expect(mountainShapeHeight({ seed: 1, gully: true }, 0, 0.4)).toBeLessThan(mountainShapeHeight({ seed: 1 }, 0, 0.4) - 0.05);
  });
});
