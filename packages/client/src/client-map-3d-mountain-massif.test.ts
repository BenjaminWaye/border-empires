import { describe, expect, it } from "vitest";
import { Color, InstancedMesh, Matrix4, Scene } from "three";
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

  it("prints a remembered mountain in the fogged tint, on top of its own per-tile shade", () => {
    const colourAt = (tint?: Color): Color => {
      const scene = new Scene();
      const massifs = createMountainMassifs(scene, 2, LONE_MOUNTAIN_LOOKUP);
      massifs.addInstance(0, 0, 0.3, 40, 12, tint);
      massifs.commit();
      const mesh = massifs.meshes.find((m) => m.count > 0)!;
      const colour = new Color();
      mesh.getColorAt(0, colour);
      massifs.dispose();
      return colour;
    };
    const plain = colourAt();
    const tinted = colourAt(new Color(0.5, 0.25, 1));
    expect(tinted.r).toBeCloseTo(plain.r * 0.5, 5);
    expect(tinted.g).toBeCloseTo(plain.g * 0.25, 5);
    expect(tinted.b).toBeCloseTo(plain.b, 5);
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

  it("snows on every mountain in cold country, and elsewhere on most summits but no filler", () => {
    const count = (cold: boolean, lookupMountains: ReadonlySet<string>, tiles: ReadonlyArray<readonly [number, number]>): number => {
      const scene = new Scene();
      const massifs = createMountainMassifs(scene, 2 * tiles.length, rangeLookup(lookupMountains, cold));
      tiles.forEach(([wx, wy], i) => massifs.addInstance(i * 2, 0, 0, wx, wy));
      massifs.commit();
      const n = massifs.snowyInstanceCount();
      massifs.dispose();
      return n;
    };
    // No mountain neighbours: every tile is a lone summit.
    const lone = Array.from({ length: 40 }, (_, i) => [i * 3, i] as const);
    expect(count(true, new Set(), lone)).toBe(40);
    const warmSummits = count(false, new Set(), lone);
    expect(warmSummits).toBeGreaterThan(15);
    expect(warmSummits).toBeLessThan(40);
    // A long range: only its filler tiles, which never snow in warm country.
    const range = new Set(Array.from({ length: 40 }, (_, x) => `${x},0`));
    const lookup = rangeLookup(range);
    const fillers = Array.from({ length: 40 }, (_, x) => [x, 0] as const).filter(([x, y]) => !isSummitTile(x, y, lookup));
    expect(fillers.length).toBeGreaterThan(10);
    expect(count(false, range, fillers)).toBe(0);
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
