import { describe, expect, it } from "vitest";
import { InstancedMesh, Scene } from "three";
import { createStructureOverlay, STRUCTURE_KINDS_HANDLED_BY_3D } from "./client-map-3d-structure-overlay.js";

describe("clearing house structure overlay", () => {
  it("is handled by the 3D structure overlay", () => {
    expect(STRUCTURE_KINDS_HANDLED_BY_3D.has("CLEARING_HOUSE")).toBe(true);
  });

  it("commits visible clearing house pieces", () => {
    const scene = new Scene();
    const overlay = createStructureOverlay(scene, 1);

    overlay.addInstance(0, 0, 0, "CLEARING_HOUSE");
    overlay.commit();

    const renderedPieces = scene.children
      .filter((child): child is InstancedMesh => child instanceof InstancedMesh)
      .reduce((total, mesh) => total + mesh.count, 0);
    expect(renderedPieces).toBeGreaterThan(0);

    overlay.dispose();
  });
});
