import { describe, expect, it } from "vitest";

import { OUTPOST_REACH_RADIUS } from "@border-empires/shared";

import {
  boxCellIndex,
  CELL_FOG,
  CELL_OTHER,
  CELL_SHADOW,
  CELL_WATER,
  FOG_BOX_CELLS,
  markOceanShadowedFog
} from "./relay-beacon-fog-shadow.js";

// Direct unit coverage for the pure shadow-marking function, kept separate
// from relay-beacon-overlap-guard.test.ts's end-to-end chooseBestRelayBeaconBuild
// scenarios: those cap out at UNEXPLORED_TILE_SAMPLE_CAP (4 cells), which masks
// exactly the kind of directional leak this suite exists to catch -- a box with
// >= 4 unshadowed fog cells scores siteValue 16 whether shadowing is scoped
// correctly or is over-shadowing unrelated cells, as long as at least 4 survive.

const R = OUTPOST_REACH_RADIUS;

const allFog = (): Uint8Array => new Uint8Array(FOG_BOX_CELLS).fill(CELL_FOG);

const setWater = (state: Uint8Array, cells: readonly [number, number][]): void => {
  for (const [dx, dy] of cells) state[boxCellIndex(dx, dy)] = CELL_WATER;
};

describe("markOceanShadowedFog", () => {
  it("leaves fog untouched when there is no visible water in the box", () => {
    const state = allFog();
    markOceanShadowedFog(state);
    for (let i = 0; i < FOG_BOX_CELLS; i += 1) expect(state[i]).toBe(CELL_FOG);
  });

  it("does not shadow fog behind a single water tile (could be a narrow strait)", () => {
    const state = allFog();
    setWater(state, [[1, 0]]);
    markOceanShadowedFog(state);
    expect(state[boxCellIndex(2, 0)]).toBe(CELL_FOG);
    expect(state[boxCellIndex(3, 0)]).toBe(CELL_FOG);
  });

  it("shadows fog directly behind two consecutive water tiles on a straight line", () => {
    const state = allFog();
    setWater(state, [
      [1, 0],
      [2, 0]
    ]);
    markOceanShadowedFog(state);
    expect(state[boxCellIndex(3, 0)]).toBe(CELL_SHADOW);
    expect(state[boxCellIndex(4, 0)]).toBe(CELL_SHADOW);
    expect(state[boxCellIndex(5, 0)]).toBe(CELL_SHADOW);
  });

  it("propagates the shadow outward through fog, not just one cell past the water", () => {
    const state = allFog();
    setWater(state, [
      [0, 1],
      [0, 2]
    ]);
    markOceanShadowedFog(state);
    for (let d = 3; d <= R; d += 1) expect(state[boxCellIndex(0, d)]).toBe(CELL_SHADOW);
  });

  it("only shadows fog on the side that actually has water — the opposite side stays fog", () => {
    const state = allFog();
    setWater(state, [
      [1, 0],
      [2, 0]
    ]);
    markOceanShadowedFog(state);
    for (let d = -R; d <= -3; d += 1) expect(state[boxCellIndex(d, 0)]).toBe(CELL_FOG);
    for (let d = 1; d <= R; d += 1) expect(state[boxCellIndex(0, d)]).toBe(CELL_FOG);
    for (let d = 1; d <= R; d += 1) expect(state[boxCellIndex(0, -d)]).toBe(CELL_FOG);
  });

  it("does not shadow a delivered non-water tile (only fog cells are ever rewritten)", () => {
    const state = allFog();
    setWater(state, [
      [1, 0],
      [2, 0]
    ]);
    state[boxCellIndex(4, 0)] = CELL_OTHER; // e.g. already-claimed reach ground sitting past the water
    markOceanShadowedFog(state);
    expect(state[boxCellIndex(4, 0)]).toBe(CELL_OTHER);
    // The cell behind it never saw two consecutive water-like cells (index 3
    // is shadow, but index 4 between it and index 5 is CELL_OTHER, not
    // water-like), so the chain stops instead of jumping over the gap.
    expect(state[boxCellIndex(5, 0)]).toBe(CELL_FOG);
  });
});
