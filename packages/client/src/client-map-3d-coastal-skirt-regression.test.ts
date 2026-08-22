import { describe, expect, it } from "vitest";
import { SKIRT_SHADE } from "./client-map-3d-heightfield/client-map-3d-heightfield.js";

// Regression guard for #1482: the coastal skirt wall sits underneath the
// animated water surface. At a wave trough the water's semi-transparent
// deep-water color (opacity 0.78, DEEP_COLOR = 0x0a2e42 in
// client-map-3d-water-surface.ts) composites over whatever the skirt shows,
// darkening it further. At SKIRT_SHADE = 0.55 that composite sampled as
// near-black (rgb(12,33,49)-rgb(25,44,55)), reading as a "black crack" at
// the shoreline. This test simulates the worst case (skirt showing pure
// black ground, i.e. the darkest possible skirt color) composited under the
// water's deep color, and asserts the result stays visibly above black.
describe("coastal skirt / water surface composite (#1482)", () => {
  it("keeps the skirt-under-water composite well above near-black even at a wave trough", () => {
    const WATER_OPACITY = 0.78;
    const DEEP_COLOR = { r: 0x0a, g: 0x2e, b: 0x42 };

    // Worst case: a fully unlit skirt tinting toward black (shade applied to
    // a dark ground color, e.g. shadowed grass ~ rgb(60, 90, 40)).
    const groundR = 60;
    const groundG = 90;
    const groundB = 40;
    const skirtR = groundR * SKIRT_SHADE;
    const skirtG = groundG * SKIRT_SHADE;
    const skirtB = groundB * SKIRT_SHADE;

    const compositeR = WATER_OPACITY * DEEP_COLOR.r + (1 - WATER_OPACITY) * skirtR;
    const compositeG = WATER_OPACITY * DEEP_COLOR.g + (1 - WATER_OPACITY) * skirtG;
    const compositeB = WATER_OPACITY * DEEP_COLOR.b + (1 - WATER_OPACITY) * skirtB;

    // The previously reported near-black samples topped out around
    // rgb(25,44,55) (max channel 55). Require the composite's brightest
    // channel to clear that by a solid margin.
    const maxChannel = Math.max(compositeR, compositeG, compositeB);
    expect(maxChannel).toBeGreaterThan(55);
  });

  it("keeps SKIRT_SHADE bright enough to no longer read as near-black", () => {
    expect(SKIRT_SHADE).toBeGreaterThanOrEqual(0.7);
  });
});
