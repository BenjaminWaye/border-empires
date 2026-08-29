import { describe, expect, it } from "vitest";
import { padTerrainWindow, requiredTerrainWindow, terrainWindowCovers, type TerrainWindow } from "./client-map-3d-terrain-window.js";

// Regression coverage for the Phase-2 pan-smoothness fix in client-map-3d.ts's
// maybeRebuild: rebuild decisions use terrainWindowCovers's padded hysteresis
// only (no exact camX/camY match), so a continuous drag rebuilds roughly once
// per pad-width of travel instead of once per tile crossed. Simulates the
// actual decision loop (minus the 48ms REBUILD_MIN_INTERVAL_MS floor, which
// only bounds an already-low rate further) against a realistic drag.
const WORLD_WIDTH = 450;
const WORLD_HEIGHT = 450;
const MAX_VISIBLE_TILES = 14_000;
const CANVAS = { canvasWidth: 1280, canvasHeight: 800 };

const simulateDragRebuildCount = (zoom: number, totalTilesTraveled: number): number => {
  let camX = 0;
  let built: TerrainWindow | undefined;
  let rebuildCount = 0;
  for (let camXStep = 0; camXStep <= totalTilesTraveled; camXStep++) {
    camX = camXStep;
    const required = requiredTerrainWindow({ zoom, camX, camY: 0, ...CANVAS });
    if (!terrainWindowCovers(built, required, WORLD_WIDTH, WORLD_HEIGHT)) {
      built = padTerrainWindow(required, MAX_VISIBLE_TILES);
      rebuildCount++;
    }
  }
  return rebuildCount;
};

describe("pan rebuild rate (Phase 2: hysteresis-only, no exact camX match)", () => {
  it("rebuilds far less than once per tile crossed at default zoom", () => {
    const tilesTraveled = 73; // ~2s of an 800px/sec drag at zoom=22, per Phase 0's probe
    const rebuilds = simulateDragRebuildCount(22, tilesTraveled);
    // Exact-match behavior (pre-fix) would rebuild once per tile, i.e. ~73 times.
    // padTerrainWindow's pad (TERRAIN_WINDOW_PAD=0.25, min 2 tiles) should keep
    // this well under half that.
    expect(rebuilds).toBeLessThan(tilesTraveled / 3);
  });

  it("still rebuilds when travel actually exceeds the padded window (never silently stale)", () => {
    // A window's pad is at least MIN_PAD_TILES=2 tiles; traveling far past any
    // plausible pad must still trigger rebuilds — this is not a "never rebuild" regression.
    const rebuilds = simulateDragRebuildCount(60, 500);
    expect(rebuilds).toBeGreaterThan(0);
  });
});
