import { describe, expect, it } from "vitest";
import { InstancedMesh, Matrix4, Scene } from "three";
import { createMountainMassifs, isSummitTile, mountainModelIndexAt, type MountainMassifDeps } from "./client-map-3d-mountain-massif.js";
import { LONE_MOUNTAIN_LOOKUP } from "./client-map-3d-mountain-massif.test-helpers.js";
import { MOUNTAIN_MODELS } from "./client-map-3d-mountain-models.js";

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

describe("mountain massif (one rock cluster per tile)", () => {
  it("keys the look on the world tile, so panning the camera never reshapes a mountain", () => {
    const shapeAt = (sceneX: number, sceneZ: number): number[][] => {
      const scene = new Scene();
      const massifs = createMountainMassifs(scene, 2, LONE_MOUNTAIN_LOOKUP);
      massifs.addInstance(sceneX, sceneZ, 0.3, 40, 12);
      massifs.commit();
      const shape = massifs.meshes.flatMap(matricesOf).map((m) =>
        m.elements.map((v, i) => (i === 12 ? v - sceneX : i === 14 ? v - sceneZ : v)).map((v) => Math.round(v * 1e6) / 1e6)
      );
      massifs.dispose();
      return shape;
    };
    expect(shapeAt(3, -2)).toEqual(shapeAt(-17, 9));
  });

  it("draws one model per mountain tile: summits for local highs, fillers for the rest of a range", () => {
    const mountains = new Set<string>();
    for (let x = 0; x < 8; x += 1) for (let y = 0; y < 3; y += 1) mountains.add(`${x},${y}`);
    const lookup = rangeLookup(mountains);
    const scene = new Scene();
    const massifs = createMountainMassifs(scene, mountains.size * 2, lookup);
    let summits = 0;
    for (const key of mountains) {
      const [x, y] = key.split(",").map(Number) as [number, number];
      massifs.addInstance(x, y, 0, x, y);
      const model = MOUNTAIN_MODELS[mountainModelIndexAt(x, y, lookup)]!;
      expect(model.role).toBe(isSummitTile(x, y, lookup) ? "summit" : "filler");
      if (model.role === "summit") summits += 1;
    }
    massifs.commit();
    expect(massifs.instanceCount()).toBe(mountains.size);
    // A range has some summits but is mostly filler (no two orthogonal neighbours are both summits).
    expect(summits).toBeGreaterThan(0);
    expect(summits).toBeLessThan(mountains.size / 2 + 1);
    massifs.dispose();
  });

  it("lone mountains are always summits", () => {
    expect(isSummitTile(5, 5, LONE_MOUNTAIN_LOOKUP)).toBe(true);
  });

  it("snows on every mountain in cold country and on none elsewhere", () => {
    const count = (cold: boolean): number => {
      const scene = new Scene();
      const massifs = createMountainMassifs(scene, 60, rangeLookup(new Set(), cold));
      for (let i = 0; i < 30; i += 1) massifs.addInstance(i * 2, 0, 0, i * 3, i);
      massifs.commit();
      const n = massifs.snowyInstanceCount();
      massifs.dispose();
      return n;
    };
    expect(count(true)).toBe(30);
    expect(count(false)).toBe(0);
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
