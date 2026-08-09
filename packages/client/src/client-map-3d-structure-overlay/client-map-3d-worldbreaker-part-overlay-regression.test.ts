import { describe, expect, it } from "vitest";
import { InstancedMesh, Scene } from "three";
import {
  createStructureOverlay,
  STRUCTURE_KINDS_HANDLED_BY_3D
} from "./client-map-3d-structure-overlay.js";
import {
  WORLDBREAKER_PART_VARIANTS,
  worldbreakerPartVariantForTile
} from "../client-map-3d-structure-worldbreaker-part.js";

// The wire kind WORLD_ENGINE_PART must be handled so real part tiles
// render a mesh (and so the 2D overlay fallback is suppressed), while
// the three variant kinds cover the three part assets: the Long
// Barrel, the Fracture Core, and the Sky-Marking Array.
const WORLDBREAKER_PART_KINDS = [
  "WORLD_ENGINE_PART",
  "WORLD_ENGINE_PART_BARREL",
  "WORLD_ENGINE_PART_CORE",
  "WORLD_ENGINE_PART_ARRAY"
] as const;

describe("worldbreaker part structure overlay", () => {
  it("handles every worldbreaker part kind in 3D", () => {
    for (const kind of WORLDBREAKER_PART_KINDS) {
      expect(STRUCTURE_KINDS_HANDLED_BY_3D.has(kind)).toBe(true);
    }
  });

  it("commits visible pieces for every worldbreaker part kind", () => {
    const scene = new Scene();
    const overlay = createStructureOverlay(scene, WORLDBREAKER_PART_KINDS.length);

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

  it("resolves worldbreaker part variants deterministically from tile coordinates", () => {
    for (let i = 0; i < 40; i += 1) {
      const first = worldbreakerPartVariantForTile(i, i);
      expect(WORLDBREAKER_PART_VARIANTS).toContain(first);
      expect(worldbreakerPartVariantForTile(i, i)).toBe(first);
    }

    const distinct = new Set(
      [0, 1, 2].map((i) => worldbreakerPartVariantForTile(i, i))
    );
    expect(distinct.size).toBeGreaterThanOrEqual(2);
  });
});
