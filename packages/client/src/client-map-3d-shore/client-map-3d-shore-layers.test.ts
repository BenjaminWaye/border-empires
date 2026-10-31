import { describe, expect, it } from "vitest";
import { MeshBasicMaterial, Scene, type Mesh } from "three";
import { createShoreLayers } from "./client-map-3d-shore-layers.js";
import { LAND_EDGE_TUCK } from "./client-map-3d-shore-sand.js";

const sandMeshes = (scene: Scene, material: MeshBasicMaterial): number =>
  scene.children.filter((c) => (c as Mesh).material === material).length;

describe("shore layers", () => {
  it("keeps the curved sand fringe however wide the water window is", () => {
    // Gating the fringe on window size flipped coasts between curved and
    // square while panning, as the box around the sea in view crossed it.
    const scene = new Scene();
    const material = new MeshBasicMaterial();
    const cornerAt = (_x: number, _z: number, out: { y: number; r: number; g: number; b: number; forestZone: number; tundraZone: number }): boolean => {
      Object.assign(out, { y: -0.04, r: 0.9, g: 0.85, b: 0.7, forestZone: 0, tundraZone: 0 });
      return true;
    };
    const layers = createShoreLayers(scene, { material, cornerAt });
    for (const windowTiles of [20, 239]) {
      layers.rebuild({ tiles: [{ gc: 0, gr: 0 }], isLandTile: (_x, z) => z < 0, windowTiles, worldOffsetX: 100, worldOffsetZ: 100, waterY: -0.06, mouths: [] });
      expect(sandMeshes(scene, material)).toBe(1);
    }
    layers.dispose();
  });

  it("builds a coarser fringe for a wide window, and hands each commit's fringe on", () => {
    // The fringe is rebuilt on the main thread on every terrain rebuild; at
    // full detail a zoomed-out coast took seconds.
    const scene = new Scene();
    const material = new MeshBasicMaterial();
    const cornerAt = (_x: number, _z: number, out: { y: number; r: number; g: number; b: number; forestZone: number; tundraZone: number }): boolean => {
      Object.assign(out, { y: -0.04, r: 0.9, g: 0.85, b: 0.7, forestZone: 0, tundraZone: 0 });
      return true;
    };
    const fringes: number[] = [];
    let coveredEdgeXs: number[] = [];
    const layers = createShoreLayers(scene, {
      material,
      cornerAt,
      onFringe: (fringe) => {
        fringes.push(fringe.positions.length / 3);
        coveredEdgeXs = [];
        for (let i = 0; i < fringe.positions.length; i += 3) if (fringe.positions[i + 2] === -LAND_EDGE_TUCK) coveredEdgeXs.push(fringe.positions[i]!);
      }
    });
    const tiles = Array.from({ length: 6 }, (_, gc) => ({ gc, gr: 0 }));
    for (const windowTiles of [40, 160]) {
      layers.rebuild({ tiles, isLandTile: (_x, z) => z < 0, windowTiles, worldOffsetX: 100, worldOffsetZ: 100, waterY: -0.06, mouths: [] });
    }
    // The coarse fringe still runs the whole length of the land edge, so it
    // keeps covering the coast skirt.
    for (let x = 0; x <= 6; x += 0.5) expect(coveredEdgeXs).toContain(x);
    layers.rebuild(null);
    expect(fringes).toHaveLength(3);
    const [near, far, cleared] = fringes as [number, number, number];
    expect(far).toBeGreaterThan(0);
    expect(far).toBeLessThan(near / 2);
    expect(cleared).toBe(0);
    layers.dispose();
  });
});
