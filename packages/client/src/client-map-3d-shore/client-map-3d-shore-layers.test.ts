import { describe, expect, it } from "vitest";
import { MeshBasicMaterial, Scene, type Mesh } from "three";
import { createShoreLayers } from "./client-map-3d-shore-layers.js";

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
});
