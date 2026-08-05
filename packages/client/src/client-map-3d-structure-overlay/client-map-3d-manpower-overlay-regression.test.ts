import { describe, expect, it } from "vitest";
import { InstancedMesh, Scene } from "three";
import { createStructureOverlay, STRUCTURE_KINDS_HANDLED_BY_3D } from "./client-map-3d-structure-overlay.js";

const MANPOWER_KINDS = [
  "QUARTERMASTERS_OFFICE",
  "LOGISTICS_GUILD",
  "ASSEMBLY_WORKS",
  "POPULATION_BUREAU",
  "IRON_LEVY",
  "ANCILLARY_FACTORY",
  "INCUBATION_ENGINE",
  "AMBARIC_TOWER"
] as const;

describe("manpower structure overlay", () => {
  it("handles every manpower kind in 3D", () => {
    for (const kind of MANPOWER_KINDS) {
      expect(STRUCTURE_KINDS_HANDLED_BY_3D.has(kind)).toBe(true);
    }
  });

  it("commits visible pieces for every manpower kind", () => {
    const scene = new Scene();
    const overlay = createStructureOverlay(scene, MANPOWER_KINDS.length);

    MANPOWER_KINDS.forEach((kind, idx) => {
      overlay.addInstance(idx * 2, 0, 0, kind);
    });
    overlay.commit();

    const renderedPieces = scene.children
      .filter((child): child is InstancedMesh => child instanceof InstancedMesh)
      .reduce((total, mesh) => total + mesh.count, 0);
    expect(renderedPieces).toBeGreaterThan(0);

    overlay.dispose();
  });
});
