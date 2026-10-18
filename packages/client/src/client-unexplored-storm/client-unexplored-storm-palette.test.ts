import { describe, expect, it } from "vitest";
import { legacy3DTerrainPalette } from "../client-map-3d-terrain-textures/client-map-3d-terrain-textures.js";
import {
  FOGGED_PRINT_WASH,
  FOGGED_PRINT_WASH_OPACITY,
  FOGGED_PRINT_WATER,
  FOGGED_PRINT_WATER_BLEND,
  UNEXPLORED_STORM_MID
} from "./client-unexplored-storm-palette.js";

type Rgb = readonly [number, number, number];

const hexToRgb = (hex: string): Rgb => {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
};
// Both renderers draw the wash as a normal blend at the given opacity.
const blend = (base: Rgb, tone: Rgb, alpha: number): Rgb =>
  [0, 1, 2].map((i) => base[i]! * (1 - alpha) + tone[i]! * alpha) as unknown as Rgb;
const luminance = ([r, g, b]: Rgb): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const chroma = (rgb: Rgb): number => Math.max(...rgb) - Math.min(...rgb);

const printLand = (live: Rgb): Rgb => blend(live, hexToRgb(FOGGED_PRINT_WASH), FOGGED_PRINT_WASH_OPACITY);

describe("remembered-tile print palette", () => {
  // Playtest: remembered desert looked exactly like desert in sight, because
  // the old tan wash was nearly the colour of sand itself.
  it("visibly dims and greys remembered sand, not just green land", () => {
    const sand = legacy3DTerrainPalette.sand;
    expect(luminance(printLand(sand))).toBeLessThan(luminance(sand) * 0.8);
    for (const live of [sand, legacy3DTerrainPalette.grassLight]) {
      expect(chroma(printLand(live))).toBeLessThan(chroma(live) * 0.75);
    }
  });

  it("keeps remembered land lighter than the storm, so brightness steps down outward", () => {
    const storm = luminance(hexToRgb(UNEXPLORED_STORM_MID));
    for (const live of [legacy3DTerrainPalette.sand, legacy3DTerrainPalette.grassDark]) {
      expect(luminance(printLand(live))).toBeGreaterThan(storm);
    }
  });

  it("greys remembered water too", () => {
    const live = legacy3DTerrainPalette.seaDeep;
    const printed = blend(live, hexToRgb(FOGGED_PRINT_WATER), FOGGED_PRINT_WATER_BLEND);
    expect(chroma(printed)).toBeLessThan(chroma(live) * 0.5);
  });
});
