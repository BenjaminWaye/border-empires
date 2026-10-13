import { describe, expect, it } from "vitest";
import type { TileVisibilityState } from "../client-types.js";
import { sampleUnexploredStormGrid } from "./client-unexplored-storm-mask.js";
import {
  createUnexploredStormReveal,
  UNEXPLORED_REVEAL_MAX_TILES,
  UNEXPLORED_REVEAL_MS,
  UNEXPLORED_REVEAL_STAGGER_MS
} from "./client-map-3d-unexplored-storm-reveal.js";

const W = 1000;
const window = (camX = 50) => ({ camX, camY: 50, halfW: 3, halfH: 3 });
const grid = (explored: (wx: number, wy: number) => boolean, camX = 50) =>
  sampleUnexploredStormGrid(window(camX), W, W, (wx, wy): TileVisibilityState => (explored(wx, wy) ? "visible" : "unexplored"));
// R (unexploredness, 0..255) and B (flash) of world tile (wx, 50) in a window at camX.
const texel = (data: Uint8Array, wx: number, camX = 50) => {
  const i = wx - camX + 3 + 1;
  const j = 3 + 1;
  const at = (j * 9 + i) * 4;
  return { r: data[at]!, flash: data[at + 2]! };
};
const DONE = UNEXPLORED_REVEAL_MS + UNEXPLORED_REVEAL_STAGGER_MS;

describe("unexplored storm reveal (3D, per tile)", () => {
  it("rolls a newly explored tile from unexplored to explored, smoothly, with a lantern flash", () => {
    const reveal = createUnexploredStormReveal();
    reveal.onGrid(grid((wx) => wx < 50), 0);
    reveal.onGrid(grid((wx, wy) => wx < 50 || (wx === 50 && wy === 50)), 1000);
    expect(texel(reveal.encode(1000).data, 50).r).toBe(255); // starts covered
    const samples = [0.25, 0.5, 0.75].map((f) => texel(reveal.encode(1000 + UNEXPLORED_REVEAL_STAGGER_MS + UNEXPLORED_REVEAL_MS * f).data, 50));
    for (let k = 1; k < samples.length; k += 1) expect(samples[k]!.r).toBeLessThan(samples[k - 1]!.r);
    expect(Math.max(...samples.map((s) => s.flash))).toBeGreaterThan(0);
    expect(reveal.isAnimating(1000 + DONE)).toBe(false);
    const done = texel(reveal.encode(1000 + DONE).data, 50);
    expect(done).toEqual({ r: 0, flash: 0 });
  });

  it("never restarts or snaps a tile already rolling back when more tiles arrive, or the camera pans", () => {
    const reveal = createUnexploredStormReveal();
    reveal.onGrid(grid((wx) => wx < 50), 0);
    reveal.onGrid(grid((wx, wy) => wx < 50 || (wx === 50 && wy === 50)), 1000);
    const mid = 1000 + UNEXPLORED_REVEAL_STAGGER_MS + UNEXPLORED_REVEAL_MS * 0.5;
    const before = texel(reveal.encode(mid).data, 50).r;
    // The rest of the expansion's vision lands in a later update...
    reveal.onGrid(grid((wx, wy) => wx < 50 || (wx === 50 && wy === 50) || (wx === 51 && wy === 50)), mid);
    expect(texel(reveal.encode(mid).data, 50).r).toBe(before);
    expect(texel(reveal.encode(mid).data, 51).r).toBe(255); // the new tile starts from covered
    // ...and the camera pans: the same world tile keeps its progress.
    reveal.onGrid(grid((wx, wy) => wx < 50 || (wx === 50 && wy === 50) || (wx === 51 && wy === 50), 52), mid);
    expect(texel(reveal.encode(mid).data, 50, 52).r).toBe(before);
  });

  it("doesn't play on login/reconnect (no land known yet) or for a bulk load", () => {
    const reveal = createUnexploredStormReveal();
    reveal.onGrid(grid(() => false), 0); // before the first chunk
    reveal.onGrid(grid((wx) => wx < 50), 100); // the first chunk lands
    expect(reveal.isAnimating(100)).toBe(false);
    expect(texel(reveal.encode(100).data, 49).r).toBe(0);

    const big = createUnexploredStormReveal();
    const bigWindow = { camX: 100, camY: 100, halfW: 30, halfH: 30 };
    big.onGrid(sampleUnexploredStormGrid(bigWindow, W, W, (wx, wy) => (wx === 100 && wy === 100 ? "visible" : "unexplored")), 0);
    big.onGrid(sampleUnexploredStormGrid(bigWindow, W, W, () => "visible"), 10);
    expect(UNEXPLORED_REVEAL_MAX_TILES).toBeLessThan(61 * 61);
    expect(big.isAnimating(10)).toBe(false);
  });

  it("is slow enough to read as clouds rolling back", () => {
    expect(UNEXPLORED_REVEAL_MS).toBeGreaterThanOrEqual(1500);
  });
});
