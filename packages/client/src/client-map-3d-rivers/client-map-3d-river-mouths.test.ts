import { describe, expect, it } from "vitest";
import { WORLD_WIDTH } from "@border-empires/shared";
import { WATER_SURFACE_Y } from "../client-map-3d-water-surface.js";
import { buildRiverMouthCalm } from "./client-map-3d-river-mouths.js";
import { appendEstuary, COVE_RADIUS, riverCoveY } from "./client-map-3d-river-edge-water.js";
import type { WaterBuffers } from "./client-map-3d-rivers-channel.js";

describe("river mouth: calm sea, cove and estuary pool", () => {
  it("calms the sea fully at a mouth corner, fading to none a few tiles out, and ignores non-mouth river ends", () => {
    const river = [{ wx: 20, wy: 10, halfWidth: 0.2 }, { wx: 21, wy: 10, halfWidth: 0.2 }];
    const calm = buildRiverMouthCalm([river], (x, z) => x === 21 && z === 10);
    expect(calm.get(10 * WORLD_WIDTH + 21)).toBe(1);
    expect(calm.get(10 * WORLD_WIDTH + 22)!).toBeGreaterThan(0);
    expect(calm.get(10 * WORLD_WIDTH + 22)!).toBeLessThan(1);
    expect(calm.has(10 * WORLD_WIDTH + 25)).toBe(false);
    expect(buildRiverMouthCalm([river], () => false).size).toBe(0);
  });

  it("cuts the land at a mouth corner down below the sea, untouched from COVE_RADIUS out, never raising it", () => {
    // Regression: the coast was a square step right where the river met the sea.
    expect(riverCoveY(0.15, 0)).toBeLessThan(WATER_SURFACE_Y);
    expect(riverCoveY(0.15, COVE_RADIUS)).toBe(0.15);
    expect(riverCoveY(0.15, COVE_RADIUS / 2)).toBeLessThan(0.15);
    expect(riverCoveY(-0.5, 0)).toBe(-0.5);
  });

  it("lays a round estuary pool, opaque at the centre and fading to nothing at its rim", () => {
    const buffers: WaterBuffers = { positions: [], colors: [], indices: [] };
    appendEstuary(buffers, 1, 2, WATER_SURFACE_Y, [0.1, 0.3, 0.4, 1]);
    const n = buffers.positions.length / 3;
    const alphas = buffers.colors.filter((_, i) => i % 4 === 3);
    expect(alphas[0]).toBe(1);
    expect(alphas[n - 1]).toBe(0);
    let maxR = 0;
    for (let i = 0; i < n; i += 1) maxR = Math.max(maxR, Math.hypot(buffers.positions[i * 3]! - 1, buffers.positions[i * 3 + 2]! - 2));
    expect(maxR).toBeGreaterThan(COVE_RADIUS);
    expect(Math.max(...buffers.indices)).toBe(n - 1);
  });
});
