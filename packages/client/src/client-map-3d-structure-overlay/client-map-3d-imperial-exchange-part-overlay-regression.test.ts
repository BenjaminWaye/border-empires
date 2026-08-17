import { describe, expect, it } from "vitest";
import { InstancedMesh, Scene } from "three";
import { createContactShadowOverlay } from "../client-map-3d-contact-shadow/client-map-3d-contact-shadow.js";
import {
  createStructureOverlay,
  STRUCTURE_KINDS_HANDLED_BY_3D
} from "./client-map-3d-structure-overlay.js";

// The Imperial Exchange's 3 unique components are real, distinct wire
// types (unique-monument-components rewrite) — each must be handled so
// it renders its own dedicated mesh: IMPERIAL_EXCHANGE_PART_1 (Golden
// Ledger), IMPERIAL_EXCHANGE_PART_2 (Counting Engine),
// IMPERIAL_EXCHANGE_PART_3 (Sovereign Seal).
const IMPERIAL_EXCHANGE_PART_KINDS = [
  "IMPERIAL_EXCHANGE_PART_1",
  "IMPERIAL_EXCHANGE_PART_2",
  "IMPERIAL_EXCHANGE_PART_3"
] as const;

describe("imperial exchange part structure overlay", () => {
  it("handles every imperial exchange part kind in 3D", () => {
    for (const kind of IMPERIAL_EXCHANGE_PART_KINDS) {
      expect(STRUCTURE_KINDS_HANDLED_BY_3D.has(kind)).toBe(true);
    }
  });

  it("commits visible pieces for every imperial exchange part kind", () => {
    const scene = new Scene();
    const overlay = createStructureOverlay(scene, IMPERIAL_EXCHANGE_PART_KINDS.length, createContactShadowOverlay(scene, IMPERIAL_EXCHANGE_PART_KINDS.length));

    IMPERIAL_EXCHANGE_PART_KINDS.forEach((kind, idx) => {
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
