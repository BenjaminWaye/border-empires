import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DOCK_OVERLAY_SVG_VARIANTS, dockOverlaySvg } from "./harbour-overlay-svg.js";

describe("2D dock sprites", () => {
  it("are the committed projections of the production 3D quay, so both renderers show the same harbour", () => {
    // Regression: the 2D sprites were hand-painted brown timber while the 3D
    // quay moved to the shared marble, iron and brass palette. Regenerate with
    // `node scripts/generate-dock-overlay-icons.mjs` after changing the harbour parts.
    for (const { filename, rotationY } of DOCK_OVERLAY_SVG_VARIANTS) {
      expect(readFileSync(new URL(`../../public/overlays/${filename}`, import.meta.url), "utf8")).toBe(dockOverlaySvg(rotationY));
    }
  });
});
