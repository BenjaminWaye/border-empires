import { Mesh, MeshStandardMaterial, Scene } from "three";
import { describe, expect, it } from "vitest";
import { createHillTerrain } from "./client-map-3d-hills.js";
import type { HeightfieldTerrainKind } from "./client-map-3d-heightfield/client-map-3d-heightfield.js";

// Regression guard for the "tiles lost their bottoms" bug. A hill dome has
// zero thickness at its own edge, the same problem SKIRT_BOTTOM_Y in
// client-map-3d-heightfield.ts exists to solve for the main grid — but the
// main grid's own skirt pass explicitly excludes hills tiles (they aren't
// part of that grid at all: `if (sample.isSea || !sample.isExplored ||
// sample.isHills) continue;`), and client-map-3d-hills.ts had no skirt of
// its own. A hill tile bordering sea or unexplored territory therefore had
// no wall bridging its edge down to a safe depth — at a grazing camera
// angle (this game's fixed tilt, see PERSPECTIVE_TILT_RADIANS in
// client-map-3d-perspective-camera.ts), that reads as a black gap right at
// the dome's edge.

const findSkirtMesh = (scene: Scene, sharedMaterial: MeshStandardMaterial): Mesh => {
  const meshes = scene.children.filter((child): child is Mesh => child instanceof Mesh);
  const skirt = meshes.find((mesh) => mesh.material !== sharedMaterial);
  if (!skirt) throw new Error("hill skirt mesh not found in scene");
  return skirt;
};

describe("hills dome skirt regression guard", () => {
  it("builds a skirt wall where a hill tile borders sea", () => {
    const scene = new Scene();
    const sharedMaterial = new MeshStandardMaterial();
    const hills = createHillTerrain(scene, 4, sharedMaterial);

    // Hill at origin; sea directly to its east, flat grass everywhere else.
    const isHillsAt = (wx: number, wy: number): boolean => wx === 0 && wy === 0;
    const tileKindAt = (wx: number, wy: number): HeightfieldTerrainKind => (wx === 1 && wy === 0 ? "SEA" : "GRASS");

    hills.rebuild({
      camX: 0,
      camY: 0,
      halfW: 2,
      halfH: 2,
      worldWidth: 450,
      worldHeight: 450,
      tileKindAt,
      isHillsAt
    });

    const skirtMesh = findSkirtMesh(scene, sharedMaterial);
    expect(skirtMesh.geometry.drawRange.count).toBeGreaterThan(0);

    hills.dispose();
  });

  it("builds no skirt wall when a hill tile borders only flat land", () => {
    const scene = new Scene();
    const sharedMaterial = new MeshStandardMaterial();
    const hills = createHillTerrain(scene, 4, sharedMaterial);

    const isHillsAt = (wx: number, wy: number): boolean => wx === 0 && wy === 0;
    const tileKindAt = (): HeightfieldTerrainKind => "GRASS";

    hills.rebuild({
      camX: 0,
      camY: 0,
      halfW: 2,
      halfH: 2,
      worldWidth: 450,
      worldHeight: 450,
      tileKindAt,
      isHillsAt
    });

    const skirtMesh = findSkirtMesh(scene, sharedMaterial);
    expect(skirtMesh.geometry.drawRange.count).toBe(0);

    hills.dispose();
  });

  it("builds no skirt wall against a neighbouring hills tile (its own dome covers that edge)", () => {
    const scene = new Scene();
    const sharedMaterial = new MeshStandardMaterial();
    const hills = createHillTerrain(scene, 4, sharedMaterial);

    // Two adjacent hill tiles, everything else flat grass.
    const isHillsAt = (wx: number, wy: number): boolean => (wx === 0 || wx === 1) && wy === 0;
    const tileKindAt = (): HeightfieldTerrainKind => "GRASS";

    hills.rebuild({
      camX: 0,
      camY: 0,
      halfW: 2,
      halfH: 2,
      worldWidth: 450,
      worldHeight: 450,
      tileKindAt,
      isHillsAt
    });

    const skirtMesh = findSkirtMesh(scene, sharedMaterial);
    expect(skirtMesh.geometry.drawRange.count).toBe(0);

    hills.dispose();
  });

  it("clears the skirt on a rebuild that no longer borders a hole", () => {
    const scene = new Scene();
    const sharedMaterial = new MeshStandardMaterial();
    const hills = createHillTerrain(scene, 4, sharedMaterial);
    const isHillsAt = (wx: number, wy: number): boolean => wx === 0 && wy === 0;

    hills.rebuild({
      camX: 0,
      camY: 0,
      halfW: 2,
      halfH: 2,
      worldWidth: 450,
      worldHeight: 450,
      tileKindAt: (wx, wy): HeightfieldTerrainKind => (wx === 1 && wy === 0 ? "SEA" : "GRASS"),
      isHillsAt
    });
    const skirtMesh = findSkirtMesh(scene, sharedMaterial);
    expect(skirtMesh.geometry.drawRange.count).toBeGreaterThan(0);

    hills.rebuild({
      camX: 0,
      camY: 0,
      halfW: 2,
      halfH: 2,
      worldWidth: 450,
      worldHeight: 450,
      tileKindAt: (): HeightfieldTerrainKind => "GRASS",
      isHillsAt
    });
    expect(skirtMesh.geometry.drawRange.count).toBe(0);

    hills.dispose();
  });

  it("removes the skirt mesh from the scene on dispose", () => {
    const scene = new Scene();
    const sharedMaterial = new MeshStandardMaterial();
    const hills = createHillTerrain(scene, 4, sharedMaterial);
    hills.dispose();

    const meshes = scene.children.filter((child): child is Mesh => child instanceof Mesh);
    expect(meshes.length).toBe(0);
  });
});
