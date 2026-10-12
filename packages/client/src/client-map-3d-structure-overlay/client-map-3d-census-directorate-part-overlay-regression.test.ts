import { describe, expect, it } from "vitest";
import { InstancedMesh, Scene } from "three";
import { createContactShadowOverlay } from "../client-map-3d-contact-shadow/client-map-3d-contact-shadow.js";
import {
  createStructureOverlay,
  STRUCTURE_KINDS_HANDLED_BY_3D
} from "./client-map-3d-structure-overlay.js";

// The Census Directorate's 3 unique components are real, distinct wire
// types (unique-monument-components rewrite) — each must be handled so
// it renders its own dedicated mesh: CENSUS_DIRECTORATE_PART_1 (Census
// Engine), CENSUS_DIRECTORATE_PART_2 (Registry Vault),
// CENSUS_DIRECTORATE_PART_3 (Levy Charter).
const CENSUS_DIRECTORATE_PART_KINDS = [
  "CENSUS_DIRECTORATE_PART_1",
  "CENSUS_DIRECTORATE_PART_2",
  "CENSUS_DIRECTORATE_PART_3"
] as const;

describe("census directorate part structure overlay", () => {
  it("handles every census directorate part kind in 3D", () => {
    for (const kind of CENSUS_DIRECTORATE_PART_KINDS) {
      expect(STRUCTURE_KINDS_HANDLED_BY_3D.has(kind)).toBe(true);
    }
  });

  it("commits visible pieces for every census directorate part kind", () => {
    const scene = new Scene();
    const overlay = createStructureOverlay(scene, CENSUS_DIRECTORATE_PART_KINDS.length, createContactShadowOverlay(scene, CENSUS_DIRECTORATE_PART_KINDS.length));

    CENSUS_DIRECTORATE_PART_KINDS.forEach((kind, idx) => {
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
