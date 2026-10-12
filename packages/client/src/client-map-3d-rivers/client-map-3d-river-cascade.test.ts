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
  it("wells up at the mountain's base and flows over the ground to the spring pool's water at the river head", () => {
    const deps = flatDeps();
    const samples = cascadeCenterline(face, 0, 0, deps);
    const first = samples[0]!;
    const last = samples[samples.length - 1]!;
    // Starts at the foot of the drawn model: off the rock, on the ground.
    const placement = mountainPlacementAt(face.mountain.x, face.mountain.y, deps.mountainLookup);
    expect(MOUNTAIN_MODELS[placement.modelIndex]).toBeDefined();
    expect(first.y).toBeLessThan(GROUND + 0.1);
    expect(Math.hypot(first.x - (face.mountain.x + 0.5), first.z - (face.mountain.y + 0.5))).toBeGreaterThan(0.4);
    // Ends at the head corner, on the pool's water.
    expect(last.x).toBeCloseTo(10);
    expect(last.z).toBeCloseTo(10);
    expect(last.y).toBeCloseTo(GROUND - RIVER_WATER_DEPTH, 1);
    // Never climbs on the way (allowing float noise).
    for (let i = 1; i < samples.length; i += 1) expect(samples[i]!.y).toBeLessThanOrEqual(samples[i - 1]!.y + 1e-6);
    // White water where it wells up, river water at the end.
    expect(first.color[0]).toBeGreaterThan(last.color[0]);
  });

  it("sits in a channel: banks either side rise above the water's edge (etched in)", () => {
    const samples = cascadeCenterline(face, 0, 0, flatDeps());
    // Away from the pool, where the banks fade into it.
    for (const p of samples.slice(0, Math.floor(samples.length * 0.8))) {
      for (const k of [0, 1] as const) expect(p.bank[k].lipY).toBeGreaterThan(p.edgeY[k] + 0.01);
    }
  });

  it("stays a finite, connected path even with the ground far below the rock (regression: NaN once it left the model)", () => {
    // A north exit; ground well below the rock, so the walk reaches the model's edge before it meets the ground.
    const northFace = riverMountainFaceOf({ corner: { x: 9, y: 8 }, heading: { dx: -1, dy: 0 }, mountain: { x: 10, y: 8 } })!;
    const samples = cascadeCenterline(northFace, 0, 0, { ...flatDeps(), heightfield: { cornerYAt: () => -1, elevationAt: () => GROUND } });
    expect(samples.length).toBeGreaterThan(10);
    for (const p of samples) {
      expect(Number.isFinite(p.x + p.y + p.z + p.edgeY[0] + p.edgeY[1] + p.bank[0].lipY + p.bank[1].outerY)).toBe(true);
      // Edges never dip below the centreline (no half of the river sunk in).
      expect(Math.min(...p.edgeY)).toBeGreaterThanOrEqual(p.y - 1e-9);
    }
    // No jumps: consecutive samples stay close.
    for (let i = 1; i < samples.length; i += 1) {
      expect(Math.hypot(samples[i]!.x - samples[i - 1]!.x, samples[i]!.z - samples[i - 1]!.z)).toBeLessThan(0.15);
    }
    const last = samples[samples.length - 1]!;
    expect(last.x).toBeCloseTo(9);
    expect(last.z).toBeCloseTo(8);
  });

  it("checks the two tiles beside its edge, across the world wrap too", () => {
    expect(cascadeSideTiles(face)).toEqual([[9, 9], [10, 9]]);
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
