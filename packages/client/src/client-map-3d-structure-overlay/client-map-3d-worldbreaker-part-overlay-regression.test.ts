import { describe, expect, it } from "vitest";
import { InstancedMesh, Scene } from "three";
import { createContactShadowOverlay } from "../client-map-3d-contact-shadow/client-map-3d-contact-shadow.js";
import {
  createStructureOverlay,
  STRUCTURE_KINDS_HANDLED_BY_3D
} from "./client-map-3d-structure-overlay.js";

// The Worldbreaker Cannon's 3 unique components are real, distinct wire
// types (unique-monument-components rewrite) — each must be handled so it
// renders its own dedicated mesh: WORLD_ENGINE_PART_1 (Long Barrel),
// WORLD_ENGINE_PART_2 (Fracture Core), WORLD_ENGINE_PART_3 (Sky-Marking
// Array).
const WORLDBREAKER_PART_KINDS = [
  "WORLD_ENGINE_PART_1",
  "WORLD_ENGINE_PART_2",
  "WORLD_ENGINE_PART_3"
] as const;

describe("worldbreaker part structure overlay", () => {
  it("handles every worldbreaker part kind in 3D", () => {
    for (const kind of WORLDBREAKER_PART_KINDS) {
      expect(STRUCTURE_KINDS_HANDLED_BY_3D.has(kind)).toBe(true);
    }
  });

  it("commits visible pieces for every worldbreaker part kind", () => {
    const scene = new Scene();
    const overlay = createStructureOverlay(scene, WORLDBREAKER_PART_KINDS.length, createContactShadowOverlay(scene, WORLDBREAKER_PART_KINDS.length));

    WORLDBREAKER_PART_KINDS.forEach((kind, idx) => {
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
