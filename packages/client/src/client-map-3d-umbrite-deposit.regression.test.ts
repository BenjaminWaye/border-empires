import { describe, expect, it } from "vitest";
import { InstancedMesh, Scene } from "three";
import { WORLD_HEIGHT, WORLD_WIDTH, isForestTileAt, setWorldSeed } from "@border-empires/shared";
import { createUmbriteDepositOverlay, umbriteDepositConceptOf, umbriteDepositVariantAt } from "./client-map-3d-umbrite-deposit.js";
import { UMBRITE_GROVE_TREES } from "./client-map-3d-umbrite-grove/umbrite-grove-parts.js";

const instancedMeshes = (scene: Scene): InstancedMesh[] =>
  scene.children.filter((child): child is InstancedMesh => child instanceof InstancedMesh);

describe("umbrite deposit overlay", () => {
  it("picks only variants 0/1/2 across a sample of tiles", () => {
    for (let x = 0; x < 200; x += 1) {
      for (let z = 0; z < 200; z += 1) {
        const v = umbriteDepositVariantAt(x, z);
        expect([0, 1, 2]).toContain(v);
      }
    }
  });

  it("commits visible pieces for every variant", () => {
    const scene = new Scene();
    const overlay = createUmbriteDepositOverlay(scene, 3);

    for (let i = 0; i < 3; i += 1) {
      overlay.addInstance(i * 2, 0, 0, i, 0);
    }
    overlay.commit();

    const renderedPieces = scene.children
      .filter((child): child is InstancedMesh => child instanceof InstancedMesh)
      .reduce((total, mesh) => total + mesh.count, 0);
    expect(renderedPieces).toBeGreaterThan(0);

    overlay.dispose();
  });

  it("clears instance counts without removing meshes from the scene", () => {
    const scene = new Scene();
    const overlay = createUmbriteDepositOverlay(scene, 1);

    overlay.addInstance(0, 0, 0, 0, 0);
    overlay.commit();
    overlay.clear();
    overlay.commit();

    const renderedPieces = scene.children
      .filter((child): child is InstancedMesh => child instanceof InstancedMesh)
      .reduce((total, mesh) => total + mesh.count, 0);
    expect(renderedPieces).toBe(0);
    expect(scene.children.filter((child) => child instanceof InstancedMesh).length).toBeGreaterThan(0);

    overlay.dispose();
  });

  it("does not allocate instance capacity proportional to per-tile piece count", () => {
    // Same GPU-blowup guard as the titanium deposit: caps were sized to the
    // worst-case pieces a single tile can emit, and stay far under a 32MB
    // budget even for a fully-iron viewport.
    const scene = new Scene();
    const overlay = createUmbriteDepositOverlay(scene, 14_000);

    const totalBytes = instancedMeshes(scene).reduce(
      (total, mesh) => total + mesh.instanceMatrix.array.length * 4,
      0
    );
    expect(totalBytes).toBeLessThan(32 * 1024 * 1024);

    overlay.dispose();
  });

  it("uploads only the instances actually used, not the whole buffer", () => {
    const scene = new Scene();
    const overlay = createUmbriteDepositOverlay(scene, 14_000);

    overlay.addInstance(0, 0, 0, 5, 5);
    overlay.commit();

    const drawn = instancedMeshes(scene).filter((mesh) => mesh.count > 0);
    expect(drawn.length).toBeGreaterThan(0);
    for (const mesh of drawn) {
      const ranges = mesh.instanceMatrix.updateRanges;
      expect(ranges).toHaveLength(1);
      expect(ranges[0]).toEqual({ start: 0, count: mesh.count * 16 });
      expect(ranges[0]!.count).toBeLessThan(mesh.instanceMatrix.array.length);
    }

    overlay.dispose();
  });

  it("maps variants 0/1/2 to the A/B/C forest concepts", () => {
    expect([0, 1, 2].map((v) => umbriteDepositConceptOf(v as 0 | 1 | 2))).toEqual(["roots", "rootbed", "fallen"]);
  });

  const findTile = (forest: boolean): [number, number] => {
    setWorldSeed(77, "continents", 1);
    for (let y = 0; y < WORLD_HEIGHT; y += 1) {
      for (let x = 0; x < WORLD_WIDTH; x += 1) if (isForestTileAt(x, y) === forest) return [x, y];
    }
    throw new Error("no matching tile");
  };
  // Grove meshes are the multi-material ones; trees each use one material.
  const treeCount = (scene: Scene): number =>
    instancedMeshes(scene).filter((mesh) => !Array.isArray(mesh.material)).reduce((total, mesh) => total + mesh.count, 0);
  const groveCount = (scene: Scene): number =>
    instancedMeshes(scene).filter((mesh) => Array.isArray(mesh.material)).reduce((total, mesh) => total + mesh.count, 0);

  it("stands the concept's own clearing of trees on a forest tile, and none off forest", () => {
    const [fx, fy] = findTile(true);
    const [bx, by] = findTile(false);
    const scene = new Scene();
    const overlay = createUmbriteDepositOverlay(scene, 2);
    overlay.addInstance(0, 0, 0, fx, fy);
    overlay.commit();
    expect(groveCount(scene)).toBe(1);
    expect(treeCount(scene)).toBe(UMBRITE_GROVE_TREES[umbriteDepositConceptOf(umbriteDepositVariantAt(fx, fy))].length);
    overlay.clear();
    overlay.addInstance(0, 0, 0, bx, by);
    overlay.commit();
    expect(groveCount(scene)).toBe(1);
    expect(treeCount(scene)).toBe(0);
    overlay.dispose();
  });
});
