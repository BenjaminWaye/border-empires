import { describe, expect, it } from "vitest";
import { InstancedMesh, Scene } from "three";
import {
  createStructureOverlay,
  STRUCTURE_KINDS_HANDLED_BY_3D
} from "./client-map-3d-structure-overlay.js";
import {
  IMPERIAL_EXCHANGE_PART_VARIANTS,
  imperialExchangePartVariantForTile
} from "../client-map-3d-structure-imperial-exchange-part.js";

// The wire kind IMPERIAL_EXCHANGE_PART must be handled so real part
// tiles render a mesh (and so the 2D overlay fallback is suppressed),
// while the three variant kinds cover the three part assets: the
// Golden Ledger, the Counting Engine, and the Sovereign Seal.
const IMPERIAL_EXCHANGE_PART_KINDS = [
  "IMPERIAL_EXCHANGE_PART",
  "IMPERIAL_EXCHANGE_PART_LEDGER",
  "IMPERIAL_EXCHANGE_PART_ENGINE",
  "IMPERIAL_EXCHANGE_PART_SEAL"
] as const;

describe("imperial exchange part structure overlay", () => {
  it("handles every imperial exchange part kind in 3D", () => {
    for (const kind of IMPERIAL_EXCHANGE_PART_KINDS) {
      expect(STRUCTURE_KINDS_HANDLED_BY_3D.has(kind)).toBe(true);
    }
  });

  it("commits visible pieces for every imperial exchange part kind", () => {
    const scene = new Scene();
    const overlay = createStructureOverlay(scene, IMPERIAL_EXCHANGE_PART_KINDS.length);

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

  it("resolves imperial exchange part variants deterministically from tile coordinates", () => {
    for (let i = 0; i < 40; i += 1) {
      const first = imperialExchangePartVariantForTile(i, i);
      expect(IMPERIAL_EXCHANGE_PART_VARIANTS).toContain(first);
      expect(imperialExchangePartVariantForTile(i, i)).toBe(first);
    }

    const distinct = new Set(
      [0, 1, 2].map((i) => imperialExchangePartVariantForTile(i, i))
    );
    expect(distinct.size).toBeGreaterThanOrEqual(2);
  });
});
