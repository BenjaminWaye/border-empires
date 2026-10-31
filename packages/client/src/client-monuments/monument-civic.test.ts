import { describe, expect, it } from "vitest";
import { createDistrictGeometry } from "../client-town-district/district-geometry.js";
import { structureModelBriefFor } from "../client-structure-info-catalog/structure-model-briefs.js";
import { TITANIUM_LEVY_MANPOWER_CONVERSION_RATIO, TITANIUM_LEVY_REGEN_FREEZE_MS } from "@border-empires/game-domain";

describe("revised civic monuments", () => {
  it("terminates the Census stone columns beneath the roof rim", () => {
    const model = createDistrictGeometry("CENSUS_DIRECTORATE", false);
    const stone = model.layers.body!;
    stone.computeBoundingBox();
    expect(stone.boundingBox!.max.y).toBeLessThanOrEqual(0.648);
    for (const geometry of Object.values(model.layers)) geometry.dispose();
  });
  it("keeps the Census side galleries low and its entrance free of a detached kiosk", () => {
    const model = createDistrictGeometry("CENSUS_DIRECTORATE", false);
    let galleryVertices = 0;
    for (const geometry of Object.values(model.layers)) {
      const positions = geometry.getAttribute("position");
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
        if (Math.abs(x) > 0.17 && y > 0.08) {
          galleryVertices++;
          expect(y).toBeLessThan(0.24);
        }
        if (z > 0.19) expect(y).toBeLessThan(0.14);
      }
      geometry.dispose();
    }
    expect(galleryVertices).toBeGreaterThan(0);
  });
  it("describes the Levy's manpower expenditure and regeneration freeze using current rules", () => {
    const role = structureModelBriefFor("TITANIUM_LEVY").role;
    expect(role).toContain(`spend ${TITANIUM_LEVY_MANPOWER_CONVERSION_RATIO * 100}% of stored manpower`);
    expect(role).toContain(`for ${TITANIUM_LEVY_REGEN_FREEZE_MS / 3_600_000} hours`);
    expect(role).toContain("army at this monument");
  });
});
