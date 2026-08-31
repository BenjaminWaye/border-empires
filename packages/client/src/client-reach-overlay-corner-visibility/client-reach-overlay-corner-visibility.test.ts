import { describe, expect, it } from "vitest";
import { isReachOverlayCornerVisible, type ReachOverlayCornerVisibilityDeps } from "./client-reach-overlay-corner-visibility.js";
import type { Tile } from "../client-types.js";

const baseDeps = (overrides: Partial<ReachOverlayCornerVisibilityDeps> = {}): ReachOverlayCornerVisibilityDeps => ({
  wrapX: (x) => x,
  wrapY: (y) => y,
  keyFor: (x, y) => `${x},${y}`,
  getTile: () => undefined,
  tileVisibilityStateAt: () => "unexplored",
  discoveredTiles: { has: () => false },
  fogDisabled: false,
  revealWholeMap: false,
  ...overrides
});

describe("isReachOverlayCornerVisible", () => {
  it("is visible when a touching tile is locally loaded and visible", () => {
    const deps = baseDeps({
      getTile: (key) => (key === "5,5" ? ({} as Tile) : undefined),
      tileVisibilityStateAt: (x, y) => (x === 5 && y === 5 ? "visible" : "unexplored")
    });
    expect(isReachOverlayCornerVisible(6, 6, deps)).toBe(true);
  });

  it("regression: stays visible for a discovered-but-not-currently-streamed island (no local tile object)", () => {
    // Reproduces the multi-island bug: the true-3D renderer only keeps
    // chunks loaded near the camera, so a boundary corner on a distant owned
    // island has no entry in state.tiles even though it was discovered long
    // ago. Before this fix, a missing tile was treated as "fogged" and the
    // border overlay silently vanished on every island but the one nearest
    // the camera.
    const deps = baseDeps({
      getTile: () => undefined,
      discoveredTiles: { has: (key) => key === "5,5" }
    });
    expect(isReachOverlayCornerVisible(6, 6, deps)).toBe(true);
  });

  it("stays hidden when the corner's tiles were never discovered and aren't loaded", () => {
    const deps = baseDeps({
      getTile: () => undefined,
      discoveredTiles: { has: () => false }
    });
    expect(isReachOverlayCornerVisible(6, 6, deps)).toBe(false);
  });

  it("stays hidden when a locally-loaded touching tile is genuinely fogged", () => {
    const deps = baseDeps({
      getTile: (key) => (key === "5,5" ? ({} as Tile) : undefined),
      tileVisibilityStateAt: (x, y) => (x === 5 && y === 5 ? "fogged" : "unexplored"),
      discoveredTiles: { has: (key) => key === "5,5" }
    });
    expect(isReachOverlayCornerVisible(6, 6, deps)).toBe(false);
  });

  it("is visible everywhere when revealWholeMap is set", () => {
    const deps = baseDeps({ revealWholeMap: true });
    expect(isReachOverlayCornerVisible(6, 6, deps)).toBe(true);
  });

  it("is visible everywhere when fog is disabled", () => {
    const deps = baseDeps({ fogDisabled: true });
    expect(isReachOverlayCornerVisible(6, 6, deps)).toBe(true);
  });
});
