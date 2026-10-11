import { describe, expect, it } from "vitest";
import { Color } from "three";
import { mountainFacetColor, type MountainFacet } from "./client-map-3d-mountain-palette.js";

const base: MountainFacet = { flat: 0.5, top: 0.6, heightFraction: 0.5, snowLine: 0, shade: 0.5, alpine: false };
const colorOf = (facet: Partial<MountainFacet>): Color => mountainFacetColor(new Color(), { ...base, ...facet });
const isGreen = (c: Color): boolean => c.g > c.r && c.g > c.b;
const isGrey = (c: Color): boolean => Math.abs(c.r - c.g) < 0.03 && Math.abs(c.g - c.b) < 0.05;
const isSnow = (c: Color): boolean => c.r > 0.75 && c.g > 0.75 && c.b > 0.7;

describe("mountain facet palette", () => {
  it("keeps grass to the foot: flat facets higher up stay rock (green patches there read as holes)", () => {
    // Regressions: flat facets where slopes met mid-range, and mesa tops
    // between taller peaks, were grass.
    expect(isGreen(colorOf({ flat: 0.97, heightFraction: 0.3 }))).toBe(false);
    expect(isGreen(colorOf({ flat: 0.97, heightFraction: 0.7 }))).toBe(false);
    expect(isGreen(colorOf({ top: 0.1 }))).toBe(true);
    expect(isGreen(colorOf({}))).toBe(false); // steep rock
  });

  it("makes alpine (cold-country) mountains grey rock with a stony foot, and snow above the line", () => {
    const rock = colorOf({ alpine: true });
    expect(isGrey(rock)).toBe(true);
    expect(isGrey(colorOf({}))).toBe(false); // temperate is brown
    expect(isGreen(colorOf({ alpine: true, top: 0.1 }))).toBe(false); // stony foot, not grass
    expect(isSnow(colorOf({ alpine: true, snowLine: 0.45, heightFraction: 0.6 }))).toBe(true);
  });
});
