import { describe, expect, it } from "vitest";
import { Color, Scene } from "three";
import { createOwnershipOverlay } from "./client-map-3d-ownership-overlay.js";

const colorAt = (colors: Float32Array, vertexIndex: number): number[] => [
  colors[vertexIndex * 3 + 0] ?? 0,
  colors[vertexIndex * 3 + 1] ?? 0,
  colors[vertexIndex * 3 + 2] ?? 0
];

// The settled bucket renders with MultiplyBlending (so a tile's real cast
// shadow shows through the tint), which bakes the bucket's opacity into the
// vertex color via lerpTowardWhite. The frontier bucket stays on the
// original alpha blend instead -- multiply always reads darker than the
// ground alone, which made frontier tint (and fog-of-war) look like a heavy,
// non-transparent wash rather than the "barely there" tint it's meant to be
// -- so frontier's material.opacity does the blending and its vertex colors
// are the raw owner color, unmodified. These tests only ever add to the
// frontier bucket, so they compare against the raw color directly.
const asRaw = (c: Color): number[] => [c.r, c.g, c.b];

describe("ownership overlay partial color update", () => {
  it("re-colors a single already-committed frontier tile without touching its neighbors", () => {
    const scene = new Scene();
    const overlay = createOwnershipOverlay(scene, 10);

    const green = new Color(0, 1, 0);
    const blue = new Color(0, 0, 1);
    const indexA = overlay.addTile(0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 1, green, true);
    const indexB = overlay.addTile(2, 0, 0, 3, 0, 0, 2, 0, 1, 3, 0, 1, green, true);
    overlay.commit();

    expect(indexA).toBe(0);
    expect(indexB).toBe(1);

    overlay.beginFrontierColorUpdates();
    overlay.setFrontierTileColor(indexA, blue);

    const colors = (overlay.frontierMesh.geometry.getAttribute("color") as { array: Float32Array }).array;
    // Tile A's 4 vertices flip to blue...
    for (let v = 0; v < 4; v += 1) expect(colorAt(colors, v)).toEqual(asRaw(blue));
    // ...while tile B (a different, uninvolved tile) is untouched.
    for (let v = 4; v < 8; v += 1) expect(colorAt(colors, v)).toEqual(asRaw(green));

    overlay.dispose();
  });

  it("silently no-ops on a stale index instead of throwing or corrupting other tiles", () => {
    const scene = new Scene();
    const overlay = createOwnershipOverlay(scene, 5);
    const green = new Color(0, 1, 0);
    overlay.addTile(0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 1, green, true);
    overlay.commit();

    overlay.beginFrontierColorUpdates();
    expect(() => overlay.setFrontierTileColor(-1, new Color(1, 0, 0))).not.toThrow();
    expect(() => overlay.setFrontierTileColor(99, new Color(1, 0, 0))).not.toThrow();

    const colors = (overlay.frontierMesh.geometry.getAttribute("color") as { array: Float32Array }).array;
    for (let v = 0; v < 4; v += 1) expect(colorAt(colors, v)).toEqual(asRaw(green));

    overlay.dispose();
  });

  it("addTile returns -1 once a bucket is at capacity, instead of silently overwriting an existing tile", () => {
    const scene = new Scene();
    const overlay = createOwnershipOverlay(scene, 1);
    const first = overlay.addTile(0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 1, new Color(0, 1, 0), true);
    const second = overlay.addTile(2, 0, 0, 3, 0, 0, 2, 0, 1, 3, 0, 1, new Color(0, 0, 1), true);

    expect(first).toBe(0);
    expect(second).toBe(-1);

    overlay.dispose();
  });

  // Regression: a rebuild's commit() stages a full 0..vertCount color range
  // (fresh base colors for every tile this rebuild reassigned to a
  // possibly-different index) and sets needsUpdate, but the GPU doesn't
  // actually consume/clear that range until the renderer draws the frame.
  // frontierDecayPulse.render() runs later in the same frame whenever a
  // rebuild happens to land alongside a live decay pulse tick, and used to
  // call beginFrontierColorUpdates() -> clearUpdateRanges(), wiping out
  // commit()'s pending full-range entry before it ever reached the GPU --
  // only the pulse's own small per-tile ranges survived to upload. Every
  // tile a rebuild reassigned to an index the pulse didn't touch that frame
  // then kept its *previous* occupant's stale GPU color forever (the
  // "random frontier tiles glow amber after panning" artifact).
  it("does not drop commit()'s pending full-range color update when a decay-pulse color write follows in the same frame", () => {
    const scene = new Scene();
    const overlay = createOwnershipOverlay(scene, 10);
    overlay.addTile(0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 1, new Color(0, 1, 0), true);
    overlay.addTile(2, 0, 0, 3, 0, 0, 2, 0, 1, 3, 0, 1, new Color(0, 1, 0), true);
    overlay.commit();

    const colorAttr = overlay.frontierMesh.geometry.getAttribute("color") as unknown as {
      updateRanges: Array<{ start: number; count: number }>;
    };
    const committedRanges = colorAttr.updateRanges.length;
    expect(committedRanges).toBeGreaterThan(0);

    overlay.beginFrontierColorUpdates();
    overlay.setFrontierTileColor(0, new Color(1, 1, 1));

    // commit()'s own range(s) must still be pending alongside the pulse's --
    // beginFrontierColorUpdates() must not have cleared them.
    expect(colorAttr.updateRanges.length).toBeGreaterThanOrEqual(committedRanges + 1);

    overlay.dispose();
  });
});
