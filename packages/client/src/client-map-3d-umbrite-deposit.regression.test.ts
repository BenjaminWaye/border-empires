import { describe, expect, it } from "vitest";
import { InstancedMesh, Scene } from "three";
import { LAYOUTS, tileHash } from "./client-map-3d-forest.js";
import { createUmbriteDepositOverlay, umbriteDepositConceptOf, umbriteDepositForestKeepSlot, umbriteDepositVariantAt } from "./client-map-3d-umbrite-deposit.js";
import { umbriteGroveClearsTreeAt } from "./client-map-3d-umbrite-grove/umbrite-grove-parts.js";

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

  it("draws only the mineralized wood: one instance per deposit, no trees of its own", () => {
    const scene = new Scene();
    const overlay = createUmbriteDepositOverlay(scene, 4);
    for (let x = 0; x < 4; x += 1) overlay.addInstance(x, 0, 0, x, 7);
    overlay.commit();
    expect(instancedMeshes(scene)).toHaveLength(3);
    expect(instancedMeshes(scene).reduce((total, mesh) => total + mesh.count, 0)).toBe(4);
    overlay.dispose();
  });

  it("clears the find's space in the tile's forest layout and keeps the rest", () => {
    for (let wx = 0; wx < 40; wx += 1) {
      const layout = LAYOUTS[tileHash(wx, 3, 7, LAYOUTS.length)]!;
      const concept = umbriteDepositConceptOf(umbriteDepositVariantAt(wx, 3));
      const keep = umbriteDepositForestKeepSlot(wx, 3, undefined);
      layout.forEach((tree, slot) => expect(keep(slot)).toBe(!umbriteGroveClearsTreeAt(concept, tree.ox, tree.oz)));
      // Some trees always survive around the find, and some always make way.
      const kept = layout.filter((_, slot) => keep(slot)).length;
      expect(kept).toBeGreaterThan(0);
    }
    const cleared = Array.from({ length: 40 }, (_, wx) => {
      const keep = umbriteDepositForestKeepSlot(wx, 3, undefined);
      return LAYOUTS[tileHash(wx, 3, 7, LAYOUTS.length)]!.some((_, slot) => !keep(slot));
    });
    expect(cleared.some(Boolean)).toBe(true);
  });

  it("still applies the forest's own filter (war thinning) to trees outside the clearing", () => {
    const keep = umbriteDepositForestKeepSlot(5, 5, () => false);
    LAYOUTS[tileHash(5, 5, 7, LAYOUTS.length)]!.forEach((_, slot) => expect(keep(slot)).toBe(false));
  });
});
