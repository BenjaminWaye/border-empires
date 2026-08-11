import { describe, expect, it } from "vitest";
import { InstancedMesh, Scene } from "three";
import {
  createStructureOverlay,
  STRUCTURE_KINDS_HANDLED_BY_3D
} from "./client-map-3d-structure-overlay.js";

// The Population Bureau's 3 unique components are real, distinct wire
// types (unique-monument-components rewrite) — each must be handled so
// it renders its own dedicated mesh: POPULATION_BUREAU_PART_1 (Census
// Engine), POPULATION_BUREAU_PART_2 (Registry Vault),
// POPULATION_BUREAU_PART_3 (Levy Charter).
const POPULATION_BUREAU_PART_KINDS = [
  "POPULATION_BUREAU_PART_1",
  "POPULATION_BUREAU_PART_2",
  "POPULATION_BUREAU_PART_3"
] as const;

describe("population bureau part structure overlay", () => {
  it("handles every population bureau part kind in 3D", () => {
    for (const kind of POPULATION_BUREAU_PART_KINDS) {
      expect(STRUCTURE_KINDS_HANDLED_BY_3D.has(kind)).toBe(true);
    }
  });

  it("commits visible pieces for every population bureau part kind", () => {
    const scene = new Scene();
    const overlay = createStructureOverlay(scene, POPULATION_BUREAU_PART_KINDS.length);

    POPULATION_BUREAU_PART_KINDS.forEach((kind, idx) => {
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
