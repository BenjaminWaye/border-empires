import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DISTRICT_PROJECT_KINDS } from "../client-town-district/district-catalog.js";
import { createDistrictGeometry } from "../client-town-district/district-geometry.js";
import { silhouettes, similarity } from "../client-town-district/district-silhouettes.js";
import { structureReviewSvg } from "../client-structure-info-catalog/structure-review-svg.js";
import { structureOverlayRoute } from "../client-structure-info-catalog/structure-overlay-route.js";

describe("completed Great Project models", () => {
  it.each(DISTRICT_PROJECT_KINDS)("renders %s within the monument budget and matches its exported 2D artwork", kind => {
    const model = createDistrictGeometry(kind);
    expect(structureOverlayRoute(kind).family).toBe("district");
    expect(model.height).toBeLessThan(0.8);
    let triangles = 0;
    for (const [layer, geometry] of Object.entries(model.layers)) {
      triangles += (geometry.index?.count ?? geometry.getAttribute("position").count) / 3;
      if (layer !== "halo" && layer !== "steam") {
        geometry.computeBoundingBox();
        const box = geometry.boundingBox!;
        expect(Math.max(Math.abs(box.min.x), Math.abs(box.max.x), Math.abs(box.min.z), Math.abs(box.max.z))).toBeLessThanOrEqual(0.405);
      }
      geometry.dispose();
    }
    expect(triangles).toBeGreaterThan(1000);
    expect(triangles).toBeLessThanOrEqual(6000);
    const name = kind.toLowerCase().replaceAll("_", "-");
    expect(readFileSync(new URL(`../../public/overlays/${name}-overlay.svg`, import.meta.url), "utf8")).toBe(structureReviewSvg(kind));
  });
  it("keeps all fifteen pairs distinguishable without colour or their shared foundation", () => {
    const models = DISTRICT_PROJECT_KINDS.map(kind => ({ kind, mask: silhouettes(kind, 1.2) }));
    for (let i = 0; i < models.length; i++) for (let j = i + 1; j < models.length; j++) {
      const a = models[i]!, b = models[j]!;
      expect(similarity(a.mask, b.mask), `${a.kind} / ${b.kind}`).toBeLessThan(0.82);
    }
  });
  it("retains a long horizontal firing assembly on the completed siege weapon", () => {
    const model = createDistrictGeometry("SOVEREIGN_SIEGE_ENGINE", false);
    const zs: number[] = [];
    for (const layer of ["body", "metal"] as const) {
      const positions = model.layers[layer]?.getAttribute("position");
      if (!positions) continue;
      for (let i = 0; i < positions.count; i++) {
        if (Math.abs(positions.getX(i)) < 0.075 && positions.getY(i) > 0.25 && positions.getY(i) < 0.395) zs.push(positions.getZ(i));
      }
    }
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(0.44);
    for (const geometry of Object.values(model.layers)) geometry.dispose();
  });
});
