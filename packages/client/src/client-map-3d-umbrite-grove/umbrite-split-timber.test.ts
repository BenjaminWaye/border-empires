import { describe, expect, it } from "vitest";
import { createSplitTimberGeometry } from "./umbrite-split-timber.js";

describe("split timber broken ends", () => {
  it("closes both mineral cores instead of leaving a hollow bark tube", () => {
    const geometries = createSplitTimberGeometry({
      points: [[0, 0, 0], [0, 1, 0]], baseRadius: 0.03, tipRadius: 0.02,
      opening: [0, 0, 1], gap: 0.8
    });
    try {
      const positions = geometries.heartwood.getAttribute("position");
      const normals = geometries.heartwood.getAttribute("normal");
      for (const end of [0, 1]) {
        const outwardNormals: number[] = [];
        for (let i = 0; i < positions.count; i += 1) {
          if (positions.getX(i) === 0 && positions.getZ(i) === 0 && positions.getY(i) === end) {
            outwardNormals.push(normals.getY(i));
          }
        }
        expect(outwardNormals.length).toBeGreaterThan(0);
        expect(outwardNormals.every((normal) => end === 0 ? normal < -0.5 : normal > 0.5)).toBe(true);
      }
    } finally {
      Object.values(geometries).forEach((geometry) => geometry.dispose());
    }
  });
});
