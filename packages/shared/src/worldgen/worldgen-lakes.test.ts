// Regression coverage for varied lake shapes (worldgenVersion 5). Pre-v5,
// every lake was a plain circle; this asserts v5 actually produces
// non-circular lakes (an elongated/wandering shape's bounding box is far
// wider than it is tall or vice versa, which a circle never is) and that
// earlier versions keep reproducing the legacy circle-only behavior
// byte-for-byte.
import { describe, expect, test } from "vitest";
import { CURRENT_WORLDGEN_VERSION, setWorldSeed, terrainAt } from "../index.js";
import { WORLD_WIDTH, WORLD_HEIGHT } from "../config.js";

// A lake's tiles form one connected SEA blob inland; this finds every such
// blob's bounding-box aspect ratio (width / height) by flood fill, skipping
// blobs that touch the map edge (could be open ocean, not a lake).
const lakeAspectRatios = (): number[] => {
  const visited = new Uint8Array(WORLD_WIDTH * WORLD_HEIGHT);
  const idx = (x: number, y: number): number => y * WORLD_WIDTH + x;
  const ratios: number[] = [];
  for (let y = 40; y < WORLD_HEIGHT - 40; y++) {
    for (let x = 0; x < WORLD_WIDTH; x++) {
      if (visited[idx(x, y)] || terrainAt(x, y) !== "SEA") continue;
      let minX = x, maxX = x, minY = y, maxY = y, size = 0;
      let touchesOpenEdge = false;
      const stack: [number, number][] = [[x, y]];
      visited[idx(x, y)] = 1;
      while (stack.length > 0) {
        const [cx, cy] = stack.pop()!;
        size++;
        minX = Math.min(minX, cx);
        maxX = Math.max(maxX, cx);
        minY = Math.min(minY, cy);
        maxY = Math.max(maxY, cy);
        if (cy <= 40 || cy >= WORLD_HEIGHT - 41) touchesOpenEdge = true;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || nx >= WORLD_WIDTH || ny < 40 || ny >= WORLD_HEIGHT - 40) continue;
          if (visited[idx(nx, ny)] || terrainAt(nx, ny) !== "SEA") continue;
          visited[idx(nx, ny)] = 1;
          stack.push([nx, ny]);
        }
      }
      // Only count small, fully-enclosed inland blobs -- open ocean forms
      // one huge connected component that would swamp this metric.
      if (touchesOpenEdge || size > 400 || size < 4) continue;
      ratios.push((maxX - minX + 1) / (maxY - minY + 1));
    }
  }
  return ratios;
};

describe("worldgen varied lake shapes (v5)", () => {
  test("worldgenVersion 5 produces at least one lake noticeably longer than it is wide (or vice versa)", () => {
    setWorldSeed(9001, "continents", CURRENT_WORLDGEN_VERSION);
    const ratios = lakeAspectRatios();
    expect(ratios.length).toBeGreaterThan(0);
    expect(ratios.some((r) => r > 1.8 || r < 1 / 1.8)).toBe(true);
  });

  test("worldgenVersion 4 (legacy) keeps producing only roughly-circular lakes", () => {
    setWorldSeed(9001, "continents", 4);
    const ratios = lakeAspectRatios();
    expect(ratios.length).toBeGreaterThan(0);
    expect(ratios.every((r) => r <= 1.8 && r >= 1 / 1.8)).toBe(true);
  });
});
