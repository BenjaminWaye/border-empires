import { describe, expect, it } from "vitest";
import { createFishStudyFoundation } from "./fish-study-foundation.js";

describe("fish apron study", () => {
  it("extends just the seaward edge to the shoreline and below the waterline", () => {
    const { geometry } = createFishStudyFoundation([0.18, 0.02, 0.18, 0.02],
      { inset: 0.132, lift: 0.003, shoreEdge: "east" });
    geometry.computeBoundingBox();
    expect(geometry.boundingBox?.min.x).toBeCloseTo(0.132);
    expect(geometry.boundingBox?.max.x).toBe(1);
    expect(geometry.boundingBox?.min.z).toBeCloseTo(0.132);
    expect(geometry.boundingBox?.max.z).toBeCloseTo(0.868);
    const points = geometry.getAttribute("position");
    let submergedEdge = false;
    for (let i = 0; i < points.count; i++) {
      if (points.getX(i) === 1 && points.getY(i) <= -0.039) submergedEdge = true;
    }
    expect(submergedEdge).toBe(true);
    geometry.dispose();
  });
  it("keeps a level, upward-facing top and seats its skirt in sloping terrain", () => {
    const { geometry, topY } = createFishStudyFoundation([0.02, 0.04, 0.01, 0.03]);
    expect(topY).toBeCloseTo(0.052);
    const positions = geometry.getAttribute("position");
    const normals = geometry.getAttribute("normal");
    let topFaces = 0;
    for (let i = 0; i < positions.count; i += 3) {
      const top = [0, 1, 2].every(offset => Math.abs(positions.getY(i + offset) - topY) < 1e-6);
      if (top) { topFaces += 1; expect(normals.getY(i)).toBeCloseTo(1); }
      for (let offset = 0; offset < 3; offset += 1) {
        const x = positions.getX(i + offset), z = positions.getZ(i + offset);
        expect(x).toBeGreaterThanOrEqual(0.039);
        expect(x).toBeLessThanOrEqual(0.961);
        expect(z).toBeGreaterThanOrEqual(0.039);
        expect(z).toBeLessThanOrEqual(0.961);
        if (positions.getY(i + offset) < topY - 1e-6) {
          const ground = (0.02 * (1 - x) + 0.04 * x) * (1 - z) + (0.01 * (1 - x) + 0.03 * x) * z;
          expect(positions.getY(i + offset)).toBeCloseTo(ground - 0.006);
        }
      }
    }
    expect(topFaces).toBe(8);
    geometry.dispose();
  });
});
