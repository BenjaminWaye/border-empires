import { BufferGeometry, Mesh, MeshStandardMaterial, Scene } from "three";
import { describe, expect, it } from "vitest";
import { WORLD_WIDTH } from "@border-empires/shared";
import { createHeightfield } from "../client-map-3d-heightfield/client-map-3d-heightfield.js";
import type { HeightfieldCornerAttributes } from "../client-map-3d-heightfield/client-map-3d-heightfield-corners.js";
import { createRiverValley, riverBankColor } from "./client-map-3d-river-valley.js";
import { indexCenterlines, RIVER_WATER_DEPTH, TRENCH_DEPTH } from "./client-map-3d-rivers-channel.js";

const GROUND = 0.18;
const flatCorner = (_x: number, _z: number, out: HeightfieldCornerAttributes): boolean => {
  Object.assign(out, { y: GROUND, r: 0.4, g: 0.6, b: 0.3, forestZone: 0, tundraZone: 0 });
  return true;
};

describe("v9 river valley terrain", () => {
  it("the heightfield leaves out exactly the tiles touching a river corner", () => {
    const heightfield = createHeightfield();
    const rebuild = (riverCornerHalfWidths?: ReadonlyMap<number, number>): number => {
      heightfield.rebuild({
        camX: 100,
        camY: 100,
        halfW: 4,
        halfH: 4,
        worldWidth: WORLD_WIDTH,
        worldHeight: WORLD_WIDTH,
        tileKindAt: () => "GRASS",
        ...(riverCornerHalfWidths ? { riverCornerHalfWidths } : {})
      });
      return heightfield.geometry.drawRange.count / 6; // drawn tiles
    };
    const all = rebuild();
    // One river corner at world (100, 100): its 4 surrounding tiles are skipped.
    expect(rebuild(new Map([[100 * WORLD_WIDTH + 100, 0.1]]))).toBe(all - 4);
  });

  it("carves a real trench under the river and meets regular terrain exactly at ground level", () => {
    // One tile, scene (0..1, 0..1); the river runs along its top edge (z = 0).
    const scene = new Scene();
    const valley = createRiverValley(scene, new MeshStandardMaterial());
    valley.rebuild({
      tiles: [{ sceneX: 0, sceneZ: 0, worldX: 100, worldZ: 100, worldX1: 101, worldZ1: 101 }],
      camX: 100,
      camY: 100,
      centerlines: indexCenterlines([[{ x: -0.5, z: 0, halfWidth: 0.15 }, { x: 0, z: 0, halfWidth: 0.15 }, { x: 0.5, z: 0, halfWidth: 0.15 }, { x: 1, z: 0, halfWidth: 0.15 }, { x: 1.5, z: 0, halfWidth: 0.15 }]]),
      cornerYAt: () => GROUND,
      cornerAttributesAt: flatCorner
    });
    const mesh = scene.children.find((c): c is Mesh => c instanceof Mesh)!;
    const pos = (mesh.geometry as BufferGeometry).getAttribute("position").array as Float32Array;
    const n = 8; // SUBDIVISIONS
    const yAt = (i: number, j: number): number => pos[(j * (n + 1) + i) * 3 + 1]!;
    // On the river: the full trench depth below the ground.
    expect(yAt(4, 0)).toBeCloseTo(GROUND - TRENCH_DEPTH);
    // The far edge (1 tile from the river) is exactly the heightfield's
    // surface, so it joins a regular neighbouring tile without a seam.
    for (let i = 0; i <= n; i += 1) expect(yAt(i, n)).toBeCloseTo(GROUND, 6);
    valley.dispose();
    expect(scene.children).toHaveLength(0);
  });
  it("darkens the lower bank into a wet band at the waterline, leaving untouched ground alone", () => {
    // Regression: with no waterline cue the water read as floating on top.
    const base: readonly [number, number, number] = [0.4, 0.6, 0.3];
    const out: [number, number, number] = [0, 0, 0];
    riverBankColor(base, 0, out);
    expect(out).toEqual([0.4, 0.6, 0.3]);
    const lum = (c: readonly number[]): number => c[0]! + c[1]! + c[2]!;
    riverBankColor(base, RIVER_WATER_DEPTH * 0.3, out);
    const upperBank = lum(out);
    riverBankColor(base, RIVER_WATER_DEPTH, out);
    const waterline = lum(out);
    expect(waterline).toBeLessThan(upperBank * 0.5);
  });
});
