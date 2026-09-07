import { describe, expect, it } from "vitest";
import { padTerrainWindow, requiredTerrainWindow, terrainWindowContainsPoint, tileChangeIsWindowRelevant } from "./client-map-3d-terrain-window.js";

// Regression coverage for the off-screen-tile-change rebuild fix in
// client-map-3d.ts's maybeRebuild: state.tilesRevision is a single global
// "something visually relevant changed somewhere on the whole known map"
// counter, so comparing it directly forced a full window rebuild on every
// off-screen tile change. terrainWindowContainsPoint is what lets maybeRebuild
// test whether a changed tile actually falls inside the currently built
// window instead.
const WORLD_WIDTH = 450;
const WORLD_HEIGHT = 450;
const MAX_VISIBLE_TILES = 14_000;

describe("terrainWindowContainsPoint", () => {
  const built = padTerrainWindow(
    requiredTerrainWindow({ zoom: 22, canvasWidth: 1280, canvasHeight: 800, camX: 100, camY: 100 }),
    MAX_VISIBLE_TILES
  );

  it("is true for the window's own center", () => {
    expect(terrainWindowContainsPoint(built, built.camX, built.camY, WORLD_WIDTH, WORLD_HEIGHT)).toBe(true);
  });

  it("is true for a point right at the +1 margin", () => {
    expect(terrainWindowContainsPoint(built, built.camX + built.halfW + 1, built.camY, WORLD_WIDTH, WORLD_HEIGHT)).toBe(true);
  });

  it("is false for a point just past the +1 margin", () => {
    expect(terrainWindowContainsPoint(built, built.camX + built.halfW + 2, built.camY, WORLD_WIDTH, WORLD_HEIGHT)).toBe(false);
  });

  it("is false for a point on the far side of the map", () => {
    const farX = (built.camX + Math.floor(WORLD_WIDTH / 2)) % WORLD_WIDTH;
    expect(terrainWindowContainsPoint(built, farX, built.camY, WORLD_WIDTH, WORLD_HEIGHT)).toBe(false);
  });

  it("wraps toroidally around the world edge", () => {
    // A window centered near x=0 should still contain a point just past the
    // wrap on the world's far edge, the same way it would contain one just
    // past 0 on the near side.
    const wrapBuilt = padTerrainWindow(
      requiredTerrainWindow({ zoom: 22, canvasWidth: 1280, canvasHeight: 800, camX: 0, camY: 0 }),
      MAX_VISIBLE_TILES
    );
    const justPastWrap = WORLD_WIDTH - 1;
    expect(terrainWindowContainsPoint(wrapBuilt, justPastWrap, 0, WORLD_WIDTH, WORLD_HEIGHT)).toBe(true);
  });
});

// Regression for the actual bug: state.tilesRevision is a single global
// "something changed somewhere on the whole known map" counter, so
// client-map-3d.ts's maybeRebuild used to rebuild its entire visible window
// on every off-screen tile change (an opponent building elsewhere, a
// distant frontier decay tick...). This is the decision maybeRebuild now
// makes instead, extracted so it's directly testable.
describe("tileChangeIsWindowRelevant", () => {
  const built = padTerrainWindow(
    requiredTerrainWindow({ zoom: 22, canvasWidth: 1280, canvasHeight: 800, camX: 100, camY: 100 }),
    MAX_VISIBLE_TILES
  );

  it("is false when every changed tile is outside the built window", () => {
    const changed = new Set(["0,0", "5,5"]);
    expect(tileChangeIsWindowRelevant(built, changed, false, WORLD_WIDTH, WORLD_HEIGHT)).toBe(false);
  });

  it("is true when a changed tile falls inside the built window", () => {
    const changed = new Set(["0,0", `${built.camX},${built.camY}`]);
    expect(tileChangeIsWindowRelevant(built, changed, false, WORLD_WIDTH, WORLD_HEIGHT)).toBe(true);
  });

  it("is true regardless of changed keys once overflowed", () => {
    expect(tileChangeIsWindowRelevant(built, new Set(), true, WORLD_WIDTH, WORLD_HEIGHT)).toBe(true);
  });

  it("is true when there is no built window yet (first rebuild)", () => {
    expect(tileChangeIsWindowRelevant(undefined, new Set(), false, WORLD_WIDTH, WORLD_HEIGHT)).toBe(true);
  });

  it("ignores an unparseable key rather than throwing", () => {
    expect(tileChangeIsWindowRelevant(built, new Set(["not-a-key"]), false, WORLD_WIDTH, WORLD_HEIGHT)).toBe(false);
  });
});
