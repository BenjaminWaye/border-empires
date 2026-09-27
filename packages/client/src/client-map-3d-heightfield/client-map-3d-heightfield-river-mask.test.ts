import { describe, expect, it } from "vitest";
import { buildRiverValleyTileMask } from "./client-map-3d-heightfield-river-mask.js";

const W = 640;
const H = 320;
const marked = (mask: Uint8Array, spanX: number): string[] =>
  [...mask].flatMap((v, k) => (v ? [`${k % spanX},${Math.floor(k / spanX)}`] : []));

describe("heightfield river-valley tile mask", () => {
  it("marks the 4 window tiles around a river corner", () => {
    // Window origin at world tile (100, 50); river corner at world (103, 52).
    const mask = buildRiverValleyTileMask(new Map([[52 * W + 103, 0.1]]), 100, 50, 10, 10, W, H)!;
    expect(marked(mask, 10).sort()).toEqual(["2,1", "2,2", "3,1", "3,2"]);
  });

  it("wraps across the world seam (window straddling x = 0, unwrapped negative origin)", () => {
    // Window starts at world x = -3 (= 637); river corner at world x = 0.
    const mask = buildRiverValleyTileMask(new Map([[10 * W + 0, 0.1]]), -3, 5, 8, 8, W, H)!;
    expect(marked(mask, 8).sort()).toEqual(["2,4", "2,5", "3,4", "3,5"]);
  });

  it("returns null when there are no river corners (v1-v8 cost nothing)", () => {
    expect(buildRiverValleyTileMask(new Map(), 0, 0, 10, 10, W, H)).toBeNull();
    expect(buildRiverValleyTileMask(undefined, 0, 0, 10, 10, W, H)).toBeNull();
  });
});
