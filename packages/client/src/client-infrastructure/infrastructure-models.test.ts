import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Scene } from "three";
import { createStructureReviewModel } from "../client-structure-info-catalog/structure-review-model.js";
import { structureReviewSvg } from "../client-structure-info-catalog/structure-review-svg.js";
import { INFRASTRUCTURE_EXPORTS, infrastructureArtUrl, infrastructureMenuCrops } from "./infrastructure-art.js";
import { createDistrictGeometry } from "../client-town-district/district-geometry.js";

describe("current infrastructure art", () => {
  it.each(INFRASTRUCTURE_EXPORTS)("matches production geometry for $filename", entry => {
    const scene = new Scene(), model = createStructureReviewModel(scene, entry.kind, undefined, false, entry.resource);
    expect(model.bounds.isEmpty()).toBe(false);
    expect(model.bounds.max.y).toBeLessThan(2.5);
    expect(Math.max(Math.abs(model.bounds.min.x), Math.abs(model.bounds.max.x), Math.abs(model.bounds.min.z), Math.abs(model.bounds.max.z))).toBeLessThan(0.56);
    model.update(2500); model.dispose(); expect(scene.children).toHaveLength(0);
    expect(readFileSync(new URL(`../../public/overlays/${entry.filename}`, import.meta.url), "utf8"))
      .toBe(structureReviewSvg(entry.kind, entry.resource));
  });
  it("preserves a visibly different load for Titanium and Crystal extraction", () => {
    expect(structureReviewSvg("MINE", "TITANIUM")).not.toBe(structureReviewSvg("MINE", "GEMS"));
  });
  it("provides exact versioned crops for all five menu images", () => {
    const crops = infrastructureMenuCrops();
    for (const kind of ["MINE", "HARBOR_EXCHANGE", "RELAY_BEACON", "OBSERVATORY", "UMBRITE_RIG"]) {
      const url = infrastructureArtUrl(kind)!; expect(url).toContain("?v=");
      const crop = crops[url]!; expect(crop).toHaveLength(4);
      expect(crop.every(n => n >= 0 && n <= 1)).toBe(true);
      expect(crop[0] + crop[2]).toBeLessThanOrEqual(1.000001);
      expect(crop[1] + crop[3]).toBeLessThanOrEqual(1.000001);
    }
  });
  it.each(["MINE", "CRYSTAL_MINE", "HARBOR_EXCHANGE", "RELAY_HOUSING", "AETHER_HOUSING"] as const)("bounds the merged machinery budget for %s", kind => {
    const model = createDistrictGeometry(kind);
    const triangles = Object.values(model.layers).reduce((n, geometry) => n + (geometry.index?.count ?? geometry.getAttribute("position").count) / 3, 0);
    expect(triangles).toBeLessThan(5000);
    for (const geometry of Object.values(model.layers)) geometry.dispose();
  });
});
