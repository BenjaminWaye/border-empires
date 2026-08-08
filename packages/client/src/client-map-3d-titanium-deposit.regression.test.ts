import { describe, expect, it } from "vitest";
import { InstancedMesh, Scene } from "three";
import { createTitaniumDepositOverlay, titaniumDepositVariantAt } from "./client-map-3d-titanium-deposit.js";

describe("titanium deposit overlay", () => {
  it("picks only variants 0/1/2 across a sample of tiles", () => {
    for (let x = 0; x < 200; x += 1) {
      for (let z = 0; z < 200; z += 1) {
        const v = titaniumDepositVariantAt(x, z);
        expect([0, 1, 2]).toContain(v);
      }
    }
  });

  it("commits visible pieces for every variant", () => {
    const scene = new Scene();
    const overlay = createTitaniumDepositOverlay(scene, 3);

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
    const overlay = createTitaniumDepositOverlay(scene, 1);

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
});
