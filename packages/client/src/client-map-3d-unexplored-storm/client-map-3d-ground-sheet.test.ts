import { describe, expect, it } from "vitest";
import { createGroundSheetGeometry } from "./client-map-3d-ground-sheet.js";

describe("fog ground sheet geometry", () => {
  it("covers the requested size in small, flat triangles with only positions", () => {
    // As one two-triangle quad the brass edge broke into offset segments
    // along screen rows on phones (interpolation precision over ~3600 tiles).
    const geometry = createGroundSheetGeometry(3600);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    expect(box?.max.x).toBeCloseTo(1800);
    expect(box?.min.z).toBeCloseTo(-1800);
    expect(box?.max.y).toBeCloseTo(0);
    expect(Object.keys(geometry.attributes)).toEqual(["position"]);
    const position = geometry.getAttribute("position");
    const index = geometry.getIndex();
    expect(index).not.toBeNull();
    let longestEdge = 0;
    for (let t = 0; index && t < index.count; t += 3) {
      for (let e = 0; e < 3; e += 1) {
        const a = index.getX(t + e);
        const b = index.getX(t + ((e + 1) % 3));
        longestEdge = Math.max(longestEdge, Math.hypot(position.getX(a) - position.getX(b), position.getZ(a) - position.getZ(b)));
      }
    }
    expect(longestEdge).toBeLessThanOrEqual(40);
    geometry.dispose();
  });
});
