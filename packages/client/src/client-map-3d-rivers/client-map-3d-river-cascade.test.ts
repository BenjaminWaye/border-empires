import { describe, expect, it } from "vitest";
import { Mesh, Quaternion, Scene, Vector3, Matrix4 } from "three";
import { setWorldSeed, WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { createMountainMassifs } from "../client-map-3d-mountain-massif.js";
import { LONE_MOUNTAIN_LOOKUP } from "../client-map-3d-mountain-massif.test-helpers.js";
import { riverMountainFaceOf, riverMountainFaces } from "../client-map-river-mountains/client-map-river-mountains.js";
import { cascadeCenterline, cascadeSideTiles, createRiverCascades, type RiverCascadeDeps } from "./client-map-3d-river-cascade.js";
import { RIVER_WATER_DEPTH } from "./client-map-3d-rivers-channel.js";

const GROUND = 0.2;
const flatDeps = (isMountainAt: (x: number, y: number) => boolean = () => true): RiverCascadeDeps => ({
  heightfield: { cornerYAt: () => GROUND, elevationAt: () => GROUND },
  mountainLookup: { ...LONE_MOUNTAIN_LOOKUP, isMountainAt: (x, y) => isMountainAt(x, y), wrapX: (x) => ((x % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH, wrapY: (y) => ((y % WORLD_HEIGHT) + WORLD_HEIGHT) % WORLD_HEIGHT }
});
const face = riverMountainFaceOf({ corner: { x: 10, y: 10 }, heading: { dx: 0, dy: 1 }, mountain: { x: 10, y: 8 } })!;

describe("river mountain cascade", () => {
  it("falls from the mountain face down to the spring pool's water at the river head", () => {
    const samples = cascadeCenterline(face, 0, 0, flatDeps());
    const first = samples[0]!;
    const last = samples[samples.length - 1]!;
    // Starts up in the gully, well above the ground.
    expect(first.y).toBeGreaterThan(GROUND + 0.4);
    // Ends at the head corner, on the pool's water.
    expect(last.x).toBeCloseTo(10);
    expect(last.z).toBeCloseTo(10);
    expect(last.y).toBeCloseTo(GROUND - RIVER_WATER_DEPTH, 1);
    // Never climbs on the way down (allowing float noise).
    for (let i = 1; i < samples.length; i += 1) expect(samples[i]!.y).toBeLessThanOrEqual(samples[i - 1]!.y + 1e-6);
    // Steep top is foam (light), the end is river water (dark).
    expect(first.color[0]).toBeGreaterThan(last.color[0]);
  });

  it("checks the two tiles beside its edge, across the world wrap too", () => {
    expect(cascadeSideTiles(face)).toEqual([[9, 9], [10, 9]]);
  });

  it("draws the river mountain with its gully turned toward the river, and no second peak", () => {
    const scene = new Scene();
    const massifs = createMountainMassifs(scene, 2, { ...LONE_MOUNTAIN_LOOKUP, riverFaceAt: () => ({ dirX: face.dirX, dirY: face.dirY }) });
    massifs.addInstance(10.5, 8.5, GROUND, 10, 8);
    massifs.commit();
    expect(massifs.riverMountainCount()).toBe(1);
    expect(massifs.instanceCount()).toBe(1);
    const riverMesh = massifs.meshes.find((m) => m.count > 0)!;
    const m = new Matrix4();
    riverMesh.getMatrixAt(0, m);
    const q = new Quaternion();
    m.decompose(new Vector3(), q, new Vector3());
    // The gully runs down the shape's local +z.
    const gully = new Vector3(0, 0, 1).applyQuaternion(q);
    expect(gully.x).toBeCloseTo(face.dirX);
    expect(gully.z).toBeCloseTo(face.dirY);
    massifs.dispose();
  });

  it("builds only for explored, still-standing river mountains on a real v9 seed", () => {
    setWorldSeed(555, "continents", 9);
    const [real] = [...riverMountainFaces().values()];
    expect(real).toBeDefined();
    const meshCount = (deps: RiverCascadeDeps, explored: boolean): number => {
      const scene = new Scene();
      const cascades = createRiverCascades(scene, deps);
      cascades.rebuild({ camX: real!.head.x, camY: real!.head.y, halfW: 6, halfH: 6, isExploredAt: () => explored });
      const n = scene.children.filter((c) => c instanceof Mesh).length;
      cascades.dispose();
      return n;
    };
    const mountainsOnly = (x: number, y: number): boolean => [...riverMountainFaces().values()].some((f) => f.mountain.x === x && f.mountain.y === y);
    expect(meshCount(flatDeps(mountainsOnly), true)).toBeGreaterThan(0);
    expect(meshCount(flatDeps(mountainsOnly), false)).toBe(0);
    expect(meshCount(flatDeps(() => false), true)).toBe(0);
  });
});
