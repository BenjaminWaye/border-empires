import { beforeAll, describe, expect, it } from "vitest";

// The 2D-canvas forest overlay's leaf/deciduous species selection reuses
// overlayVariantIndexAt(wx, wy, 3) (variant 2 = leaf, see
// client-map-render-forest-overlay.ts) so it's deterministic per world tile
// and mirrors the true-3D renderer's per-tile species hash in spirit. This
// asserts the 3-way split actually reaches all three variants across a
// sample of tiles, not just 0/1 -- i.e. the leaf variant is reachable at all.
let overlayVariantIndexAt: typeof import("./client-map-render.js").overlayVariantIndexAt;

beforeAll(async () => {
  // client-map-render.ts loads overlay images at module scope (Image()) --
  // same mock as client-forest-3d-regression.test.ts uses.
  class MockImage {
    decoding = "";
    src = "";
    complete = true;
    naturalWidth = 1;
    naturalHeight = 1;
  }
  Object.assign(globalThis, { Image: MockImage });
  ({ overlayVariantIndexAt } = await import("./client-map-render.js"));
});

describe("2D forest overlay leaf/deciduous species selection", () => {
  it("reaches all three species variants (pine, spruce, leaf) across a sample of world tiles", () => {
    const variants = new Set<number>();
    for (let wx = 0; wx < 64; wx += 1) {
      for (let wy = 0; wy < 64; wy += 1) {
        variants.add(overlayVariantIndexAt(wx, wy, 3));
      }
    }
    expect(variants).toEqual(new Set([0, 1, 2]));
  });

  it("is deterministic for a given world tile", () => {
    expect(overlayVariantIndexAt(17, 42, 3)).toBe(overlayVariantIndexAt(17, 42, 3));
  });
});
