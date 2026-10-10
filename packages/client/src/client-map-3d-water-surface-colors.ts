import { Color } from "three";
import { FOGGED_PRINT_WATER } from "./client-unexplored-storm/client-unexplored-storm-palette.js";

// Per-vertex colours for the merged water sheet (client-map-3d-water-surface.ts),
// extracted from its commit(). Each vertex blends the up-to-4 water tiles
// around it: deep vs shallow by how many are shallow (a gradient at
// coastlines), then toward the remembered-water print tone by how many are
// fogged (explored but not currently in sight), so remembered sea matches the
// sepia remembered land instead of staying live-bright.

export const WATER_DEEP_COLOR = new Color(0x0a2e42);
export const WATER_SHALLOW_COLOR = new Color(0x6abbc8);
const FOGGED_WATER_COLOR = new Color(FOGGED_PRINT_WATER);
// How far a fully fogged vertex moves toward FOGGED_WATER_COLOR.
const FOGGED_WATER_BLEND = 0.75;

export type WaterTileState = { readonly shallow: boolean; readonly fogged: boolean };

export const fillWaterVertexColors = (
  colors: Float32Array,
  vRows: number,
  vCols: number,
  minGC: number,
  minGR: number,
  tileAt: (gc: number, gr: number) => WaterTileState | undefined
): void => {
  for (let vr = 0; vr < vRows; vr++) {
    for (let vc = 0; vc < vCols; vc++) {
      let waterCount = 0;
      let shallowCount = 0;
      let foggedCount = 0;
      for (let k = 0; k < 4; k++) {
        const tile = tileAt(minGC + vc - 1 + (k & 1), minGR + vr - 1 + (k >> 1));
        if (!tile) continue;
        waterCount++;
        if (tile.shallow) shallowCount++;
        if (tile.fogged) foggedCount++;
      }
      const t = waterCount > 0 ? shallowCount / waterCount : 0;
      const f = waterCount > 0 ? (foggedCount / waterCount) * FOGGED_WATER_BLEND : 0;
      const ci = (vr * vCols + vc) * 3;
      const r = WATER_DEEP_COLOR.r + t * (WATER_SHALLOW_COLOR.r - WATER_DEEP_COLOR.r);
      const g = WATER_DEEP_COLOR.g + t * (WATER_SHALLOW_COLOR.g - WATER_DEEP_COLOR.g);
      const b = WATER_DEEP_COLOR.b + t * (WATER_SHALLOW_COLOR.b - WATER_DEEP_COLOR.b);
      colors[ci] = r + f * (FOGGED_WATER_COLOR.r - r);
      colors[ci + 1] = g + f * (FOGGED_WATER_COLOR.g - g);
      colors[ci + 2] = b + f * (FOGGED_WATER_COLOR.b - b);
    }
  }
};
