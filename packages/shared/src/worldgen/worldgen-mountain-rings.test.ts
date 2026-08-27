import { describe, expect, test } from "vitest";

import { seeded01, setWorldSeed, worldSeed } from "./worldgen.js";
import { isMountainCluster } from "./worldgen-mountain-rings.js";

const CELL = 60;

// Mirrors isMountainCluster's own seeded ring-center/radius derivation, so
// the test can locate a ring's exact geometry directly instead of guessing
// it from sampled output.
const ringAt = (gx: number, gy: number): { cx: number; cy: number; r: number } | undefined => {
  const seed = worldSeed();
  const has = seeded01(gx, gy, seed + 601) > 0.52;
  if (!has) return undefined;
  const cx = gx * CELL + Math.floor(seeded01(gx, gy, seed + 602) * CELL);
  const cy = gy * CELL + Math.floor(seeded01(gx, gy, seed + 603) * CELL);
  const r = 3 + Math.floor(seeded01(gx, gy, seed + 604) * 5);
  return { cx, cy, r };
};

describe("isMountainCluster ring gaps", () => {
  test("every ring formation excludes at least one integer tile from its own annulus (a gap), never a fully closed loop", () => {
    let ringsChecked = 0;
    for (let seed = 1; seed <= 300; seed += 1) {
      setWorldSeed(seed * 1000, "continents");
      for (let gx = 0; gx < 8; gx += 1) {
        for (let gy = 0; gy < 8; gy += 1) {
          const ring = ringAt(gx, gy);
          if (!ring) continue;

          // Enumerate every integer lattice tile that falls inside the
          // annulus band (radius r-2..r) by the exact same distance test
          // isMountainCluster uses internally — this avoids any rounding
          // drift a trig-based re-derivation of the circle would introduce.
          const annulusTiles: Array<{ x: number; y: number }> = [];
          for (let dy = -ring.r; dy <= ring.r; dy += 1) {
            for (let dx = -ring.r; dx <= ring.r; dx += 1) {
              const d2 = dx * dx + dy * dy;
              if (d2 <= ring.r * ring.r && d2 >= (ring.r - 2) * (ring.r - 2)) {
                annulusTiles.push({ x: ring.cx + dx, y: ring.cy + dy });
              }
            }
          }
          if (annulusTiles.length === 0) continue;
          ringsChecked += 1;

          // A fully closed ring (the pre-fix behavior) reports every one of
          // these annulus tiles as mountain. The fix must leave at least one
          // excluded, so the interior is never fully sealed off.
          const hasGapTile = annulusTiles.some((t) => !isMountainCluster(t.x, t.y));
          expect(hasGapTile).toBe(true);
        }
      }
    }
    // Sanity check the sampled region actually produced rings to assert on.
    expect(ringsChecked).toBeGreaterThan(0);
  });
});
