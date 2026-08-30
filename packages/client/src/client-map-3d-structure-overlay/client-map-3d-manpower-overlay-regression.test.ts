import { describe, expect, it } from "vitest";
import { InstancedMesh, Scene } from "three";
import { createContactShadowOverlay } from "../client-map-3d-contact-shadow/client-map-3d-contact-shadow.js";
import { createStructureOverlay, STRUCTURE_KINDS_HANDLED_BY_3D } from "./client-map-3d-structure-overlay.js";

// These must be the real backend economicStructure.type strings (what
// client-map-3d.ts actually passes to addInstance), not display names —
// GARRISON_HALL/GRANARY/AETHER_TOWER are the wire-protocol identifiers for
// Ancillary Factory/Incubation Engine/Ambaric Transformer Station. Using the display
// names here previously let this test pass while the real dedicated 3D
// models were unreachable dead code (shadowed by stale registrations in
// client-map-3d-structure-civic/economic/late-game.ts under the same
// real backend type).
const MANPOWER_KINDS = [
  "QUARTERMASTERS_OFFICE",
  "LOGISTICS_GUILD",
  "ASSEMBLY_WORKS",
  "POPULATION_BUREAU",
  "TITANIUM_LEVY",
  "GARRISON_HALL",
  "GRANARY",
  "AETHER_TOWER"
] as const;

describe("manpower structure overlay", () => {
  it("handles every manpower kind in 3D", () => {
    for (const kind of MANPOWER_KINDS) {
      expect(STRUCTURE_KINDS_HANDLED_BY_3D.has(kind)).toBe(true);
    }
  });

  it("commits visible pieces for every manpower kind", () => {
    const scene = new Scene();
    const overlay = createStructureOverlay(scene, MANPOWER_KINDS.length, createContactShadowOverlay(scene, MANPOWER_KINDS.length));

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
