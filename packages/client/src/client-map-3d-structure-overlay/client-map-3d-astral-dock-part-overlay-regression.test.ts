import { describe, expect, it } from "vitest";
import { InstancedMesh, Scene } from "three";
import {
  createStructureOverlay,
  STRUCTURE_KINDS_HANDLED_BY_3D
} from "./client-map-3d-structure-overlay.js";

// The Astral Dock's 3 unique components are real, distinct wire types
// (unique-monument-components rewrite) — each must be handled so it
// renders its own dedicated mesh: ASTRAL_DOCK_PART_1 (Launch Cradle),
// ASTRAL_DOCK_PART_2 (Orbital Array), ASTRAL_DOCK_PART_3 (Aether Sail).
const ASTRAL_DOCK_PART_KINDS = [
  "ASTRAL_DOCK_PART_1",
  "ASTRAL_DOCK_PART_2",
  "ASTRAL_DOCK_PART_3"
] as const;

describe("astral dock part structure overlay", () => {
  it("handles every astral dock part kind in 3D", () => {
    for (const kind of ASTRAL_DOCK_PART_KINDS) {
      expect(STRUCTURE_KINDS_HANDLED_BY_3D.has(kind)).toBe(true);
    }
  });

  it("commits visible pieces for every astral dock part kind", () => {
    const scene = new Scene();
    const overlay = createStructureOverlay(scene, ASTRAL_DOCK_PART_KINDS.length);

    ASTRAL_DOCK_PART_KINDS.forEach((kind, idx) => {
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
