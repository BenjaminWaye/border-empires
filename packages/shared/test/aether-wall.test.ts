import { describe, expect, it } from "vitest";
import { aetherWallEdgeKey, buildAetherWallSegments } from "../src/aether-wall.js";

describe("aether wall geometry", () => {
  it("keeps edge keys directional for one-way blocking", () => {
    expect(aetherWallEdgeKey(10, 20, 10, 19)).not.toBe(aetherWallEdgeKey(10, 19, 10, 20));
  });

  it("spans up to three contiguous borders from the origin", () => {
    const segments = buildAetherWallSegments(5, 7, "N", 3, (x) => x, (y) => y);
    expect(segments).toEqual([
      { fromX: 5, fromY: 7, toX: 5, toY: 6, baseX: 5, baseY: 7 },
      { fromX: 6, fromY: 7, toX: 6, toY: 6, baseX: 6, baseY: 7 },
      { fromX: 7, fromY: 7, toX: 7, toY: 6, baseX: 7, baseY: 7 }
    ]);
  });
});
