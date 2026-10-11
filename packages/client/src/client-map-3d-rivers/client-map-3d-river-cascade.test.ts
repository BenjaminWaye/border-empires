import { describe, expect, it } from "vitest";
import { Mesh, Scene } from "three";
import { setWorldSeed, WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { mountainPlacementAt } from "../client-map-3d-mountain-massif.js";
import { MOUNTAIN_MODELS } from "../client-map-3d-mountain-models.js";
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

  it("starts on the rock of the model drawn on the river mountain's tile", () => {
    // A lone mountain (only its own tile is mountain) gets a summit model.
    const lone = flatDeps((x, y) => x === face.mountain.x && y === face.mountain.y);
    const samples = cascadeCenterline(face, 0, 0, lone);
    const placement = mountainPlacementAt(face.mountain.x, face.mountain.y, lone.mountainLookup);
    expect(MOUNTAIN_MODELS[placement.modelIndex]!.role).toBe("summit");
    // Well above the ground: on the model's face, not on the grass.
    expect(samples[0]!.y).toBeGreaterThan(GROUND + 0.4);
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
