import { describe, expect, it } from "vitest";
import { InstancedMesh, Matrix4, Scene, Vector3 } from "three";
import { createMountainMassifs, type MountainMassifDeps } from "./client-map-3d-mountain-massif.js";
import { LONE_MOUNTAIN_LOOKUP } from "./client-map-3d-mountain-massif.test-helpers.js";
import { mountainNeighbourhoodAt, mountainVariationAt } from "./client-map-mountain-variation/client-map-mountain-variation.js";

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

describe("mountain massif variety", () => {
  it("keys the look on the world tile, so panning the camera never reshapes a mountain", () => {
    const shapeAt = (sceneX: number, sceneZ: number): number[][] => {
      const scene = new Scene();
      const massifs = createMountainMassifs(scene, 2, LONE_MOUNTAIN_LOOKUP);
      massifs.addInstance(sceneX, sceneZ, 0.3, 40, 12);
      massifs.commit();
      // Drop the translation: only rotation/scale/height should match.
      const shape = matricesOf(massifs.peakMesh).map((m) => {
        const e = m.elements.map((v, i) => (i === 12 ? v - sceneX : i === 14 ? v - sceneZ : v));
        return e.map((v) => Math.round(v * 1e6) / 1e6);
      });
      massifs.dispose();
      return shape;
    };
    expect(shapeAt(3, -2)).toEqual(shapeAt(-17, 9));
  });

  it("varies peak height between tiles", () => {
    const heights = new Set<number>();
    for (let i = 0; i < 12; i += 1) {
      const scene = new Scene();
      const massifs = createMountainMassifs(scene, 1, LONE_MOUNTAIN_LOOKUP);
      massifs.addInstance(0, 0, 0, i, i * 5);
      massifs.commit();
      heights.add(Math.round(new Vector3().setFromMatrixScale(matricesOf(massifs.peakMesh)[0]!).y * 1000));
      massifs.dispose();
    }
    expect(heights.size).toBeGreaterThan(6);
  });

  it("adds secondary peaks and saddles, never more snow caps than peaks, within capacity", () => {
    const mountains = new Set<string>();
    for (let x = 0; x < 6; x += 1) for (let y = 0; y < 3; y += 1) mountains.add(`${x},${y}`);
    const scene = new Scene();
    const max = mountains.size;
    const lookup = rangeLookup(mountains);
    const massifs = createMountainMassifs(scene, max, lookup);
    let expectedPeaks = 0;
    for (const key of mountains) {
      const [x, y] = key.split(",").map(Number) as [number, number];
      massifs.addInstance(x, y, 0, x, y);
      const v = mountainVariationAt(x, y, mountainNeighbourhoodAt(x, y, lookup));
      expectedPeaks += 1 + Number(v.secondary !== null) + Number(v.saddleEast) + Number(v.saddleSouth);
    }
    massifs.commit();
    expect(massifs.rockBaseMesh.count).toBe(max);
    expect(massifs.peakMesh.count).toBe(expectedPeaks);
    // 5 east-west pairs per row x 3 rows + 6 columns x 2 north-south pairs.
    expect(expectedPeaks).toBeGreaterThanOrEqual(max + 15 + 12);
    expect(massifs.snowCapMesh.count).toBeLessThanOrEqual(massifs.peakMesh.count);
    expect(massifs.peakMesh.count).toBeLessThanOrEqual(max * 4);
    massifs.dispose();
  });

  it("caps every mountain with snow in cold country, only tall ones elsewhere", () => {
    const count = (cold: boolean): number => {
      const scene = new Scene();
      const massifs = createMountainMassifs(scene, 30, rangeLookup(new Set(), cold));
      for (let i = 0; i < 30; i += 1) massifs.addInstance(i * 2, 0, 0, i * 3, i);
      massifs.commit();
      const n = massifs.snowCapMesh.count;
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
    expect(massifs.rockBaseMesh.count + massifs.peakMesh.count + massifs.snowCapMesh.count).toBe(0);
    massifs.dispose();
  });
});
