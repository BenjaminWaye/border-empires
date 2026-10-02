import { afterEach, describe, expect, it } from "vitest";
import { WORLD_HEIGHT, WORLD_WIDTH, clearForestAroundAfcTile, isForestTileAt, resetForestClearings, setWorldSeed, terrainAt } from "@border-empires/shared";
import {
  createAfcJoinDropState,
  isForestTileWithAfcLandingHold,
  isInHeldAfcLandingFootprint,
  terrainWithAfcLandingHold,
  type AfcJoinDropState
} from "./client-afc-join-drop-state.js";

const dropAt = (x: number, y: number, overrides: Partial<AfcJoinDropState> = {}): AfcJoinDropState => ({
  ...createAfcJoinDropState(),
  x,
  y,
  phase: "playing",
  revealed: false,
  ...overrides
});

const findTile = (predicate: (x: number, y: number) => boolean): { x: number; y: number } => {
  for (let y = 20; y < WORLD_HEIGHT - 20; y += 1) {
    for (let x = 0; x < WORLD_WIDTH; x += 1) if (predicate(x, y)) return { x, y };
  }
  throw new Error("no matching tile in this world");
};

describe("AFC landing footprint hold", () => {
  afterEach(() => resetForestClearings());

  it("holds only the 3x3 footprint, and only until the join drop reveals the AFC", () => {
    expect(isInHeldAfcLandingFootprint(dropAt(10, 10), 11, 9)).toBe(true);
    expect(isInHeldAfcLandingFootprint(dropAt(10, 10), 12, 10)).toBe(false);
    expect(isInHeldAfcLandingFootprint(dropAt(10, 10, { phase: "waiting" }), 9, 11)).toBe(true);
    expect(isInHeldAfcLandingFootprint(dropAt(10, 10, { revealed: true }), 10, 10)).toBe(false);
    expect(isInHeldAfcLandingFootprint(dropAt(10, 10, { phase: "done" }), 10, 10)).toBe(false);
    // Footprint wraps across the world's x seam.
    expect(isInHeldAfcLandingFootprint(dropAt(0, 10), WORLD_WIDTH - 1, 10)).toBe(true);
  });

  it("keeps drawing a flattened footprint mountain as a mountain until touchdown", () => {
    setWorldSeed(77, "continents", 1);
    const mountain = findTile((x, y) => terrainAt(x, y) === "MOUNTAIN");
    const center = { x: mountain.x + 1, y: mountain.y };
    // The server flattened it, so the tile itself now reports LAND.
    expect(terrainWithAfcLandingHold(dropAt(center.x, center.y), mountain.x, mountain.y, "LAND")).toBe("MOUNTAIN");
    expect(terrainWithAfcLandingHold(dropAt(center.x, center.y, { revealed: true }), mountain.x, mountain.y, "LAND")).toBe("LAND");
    // Generated land is never turned into a mountain.
    const land = findTile((x, y) => terrainAt(x, y) === "LAND");
    expect(terrainWithAfcLandingHold(dropAt(land.x, land.y), land.x, land.y, "LAND")).toBe("LAND");
  });

  it("keeps drawing cleared footprint forest until touchdown, then shows it cleared", () => {
    setWorldSeed(77, "continents", 1);
    const forest = findTile((x, y) => isForestTileAt(x, y));
    clearForestAroundAfcTile(forest.x, forest.y);
    expect(isForestTileAt(forest.x, forest.y)).toBe(false);
    expect(isForestTileWithAfcLandingHold(dropAt(forest.x, forest.y), forest.x, forest.y)).toBe(true);
    expect(isForestTileWithAfcLandingHold(dropAt(forest.x, forest.y, { revealed: true }), forest.x, forest.y)).toBe(false);
    // Someone else's AFC landing elsewhere (no held drop here) shows cleared immediately.
    expect(isForestTileWithAfcLandingHold(createAfcJoinDropState(), forest.x, forest.y)).toBe(false);
  });
});
