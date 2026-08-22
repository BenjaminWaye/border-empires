import { describe, expect, it } from "vitest";
import {
  padTerrainWindow,
  requiredTerrainWindow,
  terrainWindowCovers,
  terrainWindowPanned,
  tileCountForWindow,
  type TerrainWindow
} from "./client-map-3d-terrain-window.js";

// Mirrors packages/shared/src/config.ts and client-constants.ts. Inlined to keep
// this a pure unit test with no @border-empires/shared dependency.
const WORLD_WIDTH = 450;
const WORLD_HEIGHT = 450;
const MIN_ZOOM = 10;

const CANVAS = { canvasWidth: 1920, canvasHeight: 1080 };
const BUDGET = 14_000;

const windowAt = (zoom: number, camX = 200, camY = 200): TerrainWindow =>
  requiredTerrainWindow({ zoom, camX, camY, ...CANVAS });

const builtAt = (zoom: number, camX = 200, camY = 200): TerrainWindow =>
  padTerrainWindow(windowAt(zoom, camX, camY), BUDGET);

const covers = (built: TerrainWindow, required: TerrainWindow): boolean =>
  terrainWindowCovers(built, required, WORLD_WIDTH, WORLD_HEIGHT);

describe("terrain window", () => {
  it("computes the same half-extents the renderer used inline before", () => {
    // floor(1920 / 22 / 2) = 43, floor(1080 / 22 / 2) = 24
    expect(windowAt(22)).toMatchObject({ halfW: 43, halfH: 24 });
  });

  describe("zooming in", () => {
    it("never needs a rebuild — the requirement only shrinks", () => {
      const built = builtAt(20);
      for (let zoom = 20; zoom <= 192; zoom += 1) {
        expect(covers(built, windowAt(zoom))).toBe(true);
      }
    });
  });

  describe("zooming out", () => {
    it("stays covered for small steps but rebuilds once past the pad", () => {
      const built = builtAt(100);
      // A single 1.15 wheel notch out (100 -> 87) is absorbed.
      expect(covers(built, windowAt(87))).toBe(true);
      // Far enough out and the window must grow.
      expect(covers(built, windowAt(40))).toBe(false);
    });

    it("rebuilds far less often than once per zoom level", () => {
      // The regression this guards: every distinct zoom value used to force a
      // full rebuild, so crossing the range cost ~180 of them.
      let built = builtAt(192);
      let rebuilds = 0;
      for (let zoom = 192; zoom >= MIN_ZOOM; zoom -= 1) {
        const required = windowAt(zoom);
        if (!covers(built, required)) {
          built = padTerrainWindow(required, BUDGET);
          rebuilds += 1;
        }
      }
      expect(rebuilds).toBeLessThanOrEqual(20);
    });
  });

  describe("panning", () => {
    it("absorbs small pans and rebuilds on large ones", () => {
      const built = builtAt(22, 200, 200);
      expect(covers(built, windowAt(22, 205, 200))).toBe(true);
      expect(covers(built, windowAt(22, 200, 204))).toBe(true);
      expect(covers(built, windowAt(22, 260, 200))).toBe(false);
      expect(covers(built, windowAt(22, 200, 250))).toBe(false);
    });

    it("handles the world seam — wrapping is a short pan, not a full-map jump", () => {
      // camX 2 and camX 448 are 4 tiles apart across the seam, not 446.
      const built = builtAt(22, 2, 200);
      expect(covers(built, windowAt(22, 448, 200))).toBe(true);
      expect(covers(built, windowAt(22, WORLD_WIDTH - 1, 200))).toBe(true);
      // And a genuinely distant camera across the seam still rebuilds.
      expect(covers(built, windowAt(22, 300, 200))).toBe(false);
    });

    it("treats an axis-spanning window as covering every center on that axis", () => {
      const spanning: TerrainWindow = { camX: 0, camY: 200, halfW: WORLD_WIDTH, halfH: 24 };
      expect(covers(spanning, windowAt(22, 400, 200))).toBe(true);
    });
  });

  describe("buffer budget", () => {
    it("never pads past the preallocated tile budget", () => {
      for (let zoom = MIN_ZOOM; zoom <= 192; zoom += 1) {
        const built = builtAt(zoom);
        const required = windowAt(zoom);
        const fitsBudget = tileCountForWindow(built.halfW, built.halfH) <= BUDGET;
        const isAtRequirement = built.halfW === required.halfW && built.halfH === required.halfH;
        expect(fitsBudget || isAtRequirement).toBe(true);
      }
    });

    it("never returns a window smaller than the camera requires", () => {
      for (let zoom = MIN_ZOOM; zoom <= 192; zoom += 1) {
        const built = builtAt(zoom);
        const required = windowAt(zoom);
        expect(built.halfW).toBeGreaterThanOrEqual(required.halfW);
        expect(built.halfH).toBeGreaterThanOrEqual(required.halfH);
      }
    });

    it("gives up the pad rather than the requirement when the budget is tight", () => {
      // At MIN_ZOOM the budget is sized for exactly the unpadded window.
      const required = windowAt(MIN_ZOOM);
      const built = padTerrainWindow(required, tileCountForWindow(required.halfW, required.halfH));
      expect(built).toMatchObject({ halfW: required.halfW, halfH: required.halfH });
    });

    it("still pads at zoom levels with budget headroom", () => {
      const required = windowAt(48);
      const built = padTerrainWindow(required, BUDGET);
      expect(built.halfW).toBeGreaterThan(required.halfW);
      expect(built.halfH).toBeGreaterThan(required.halfH);
    });
  });

  it("treats a missing built window as uncovered, so the first frame rebuilds", () => {
    expect(terrainWindowCovers(undefined, windowAt(22), WORLD_WIDTH, WORLD_HEIGHT)).toBe(false);
  });

  describe("terrainWindowPanned", () => {
    // Regression for the terrain visibly separating from every other 3D
    // overlay (ownership border pylons especially) while panning: the pad in
    // padTerrainWindow() let terrainWindowCovers() stay satisfied -- and so
    // skip a rebuild -- for any pan that drifted less than the padded
    // extent, even though the terrain's baked geometry doesn't move on its
    // own between rebuilds while border pylons/markers reposition every
    // frame off the live camera regardless of the pad. A small pan used to
    // be silently absorbed by terrainWindowCovers; terrainWindowPanned must
    // catch it even when the padded window still technically covers it.
    it("is true for a small pan that terrainWindowCovers would still absorb inside the pad", () => {
      const built = builtAt(22, 200, 200);
      const required = windowAt(22, 201, 200);
      expect(covers(built, required)).toBe(true);
      expect(terrainWindowPanned(built, required)).toBe(true);
    });

    it("is false when the camera hasn't moved since the last rebuild", () => {
      const built = builtAt(22, 200, 200);
      const required = windowAt(22, 200, 200);
      expect(terrainWindowPanned(built, required)).toBe(false);
    });

    it("is false with no built window yet, matching terrainWindowCovers' first-frame handling", () => {
      expect(terrainWindowPanned(undefined, windowAt(22))).toBe(false);
    });

    it("is true across the wrapping seam, same as a same-magnitude non-wrapping pan", () => {
      const built = builtAt(22, 0, 200);
      const required = windowAt(22, WORLD_WIDTH - 1, 200);
      expect(terrainWindowPanned(built, required)).toBe(true);
    });
  });
});
