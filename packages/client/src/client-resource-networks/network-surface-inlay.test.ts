import { describe, expect, it } from "vitest";
import { clipInlayToFacet, type UV, type UVTriangle } from "./network-surface-inlay.js";
import { createNetworkGeometry } from "./network-models.js";

const facet: UVTriangle = [[0, 0], [1, 0], [0, 1]];
const area = (polygon: readonly UV[]): number => Math.abs(polygon.reduce((sum, p, i) => {
  const q = polygon[(i + 1) % polygon.length]!;
  return sum + p[0] * q[1] - q[0] * p[1];
}, 0)) / 2;

describe("metal inlays follow the host-rock facets", () => {
  it("clips a crossing vein at the facet edge instead of spanning incompatible planes", () => {
    const clipped = clipInlayToFacet([[0, 0], [1, 0], [1, 1], [0, 1]], facet);
    expect(area(clipped)).toBeCloseTo(0.5);
    for (const [u, v] of clipped) {
      expect(u).toBeGreaterThanOrEqual(0); expect(v).toBeGreaterThanOrEqual(0);
      expect(u + v).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
  it("retains embedded patches and drops patches outside the host surface", () => {
    const inside: readonly UV[] = [[0.1, 0.1], [0.2, 0.1], [0.2, 0.2], [0.1, 0.2]];
    expect(clipInlayToFacet(inside, facet)).toEqual(inside);
    expect(clipInlayToFacet([[2, 2], [3, 2], [2, 3]], facet)).toEqual([]);
  });
  it("renders conductive ore with physical metallic inlays and no emissive layer", () => {
    const geometry = createNetworkGeometry("CONDUCTIVE_MINERALS", false);
    expect(geometry.layers.body).toBeDefined();
    expect(geometry.layers.metal?.getAttribute("position").count).toBeGreaterThan(0);
    expect(geometry.layers.glow).toBeUndefined();
    for (const layer of Object.values(geometry.layers)) layer.dispose();
  });
});
