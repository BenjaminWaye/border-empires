import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PROJECTION_RIGHT, PROJECTION_UP } from "../client-structure-info-catalog/mesh-projection-svg.js";
import { DOCK_SPRITE_RIGHT, DOCK_SPRITE_SCALE, DOCK_SPRITE_UP } from "./dock-sprite-frame.js";
import { DOCK_OVERLAY_SVG_VARIANTS, dockOverlaySvg, dockSpriteFitScale } from "./harbour-overlay-svg.js";

describe("2D dock sprites", () => {
  it("are the committed projections of the production 3D quay, one per facing", () => {
    // Regression: the 2D sprites were hand-painted brown timber while the 3D
    // quay moved to the shared marble, iron and brass palette. Regenerate with
    // `node scripts/generate-dock-overlay-icons.mjs` after changing the harbour models.
    expect(DOCK_OVERLAY_SVG_VARIANTS).toHaveLength(4);
    for (const { filename, facing } of DOCK_OVERLAY_SVG_VARIANTS) {
      expect(readFileSync(new URL(`../../public/overlays/${filename}`, import.meta.url), "utf8")).toBe(dockOverlaySvg(facing));
    }
  });

  it("frames every facing at one scale about the tile centre, fitting the sprite", () => {
    // Per-sprite fitting drew each facing at a different size and off-centre,
    // so the quay jumped in scale between neighbouring docks and the 2D fire missed it.
    const fit = dockSpriteFitScale();
    expect(DOCK_SPRITE_SCALE).toBeLessThanOrEqual(fit);
    expect(DOCK_SPRITE_SCALE).toBeGreaterThan(fit * 0.97);
  });

  it("places points with the same view as the SVG projector", () => {
    for (const [mine, projector] of [[DOCK_SPRITE_RIGHT, PROJECTION_RIGHT], [DOCK_SPRITE_UP, PROJECTION_UP]] as const) {
      expect(mine[0]).toBeCloseTo(projector.x, 9);
      expect(mine[1]).toBeCloseTo(projector.y, 9);
      expect(mine[2]).toBeCloseTo(projector.z, 9);
    }
  });
});
