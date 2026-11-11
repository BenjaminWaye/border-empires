import { describe, expect, it } from "vitest";
import { WORLD_WIDTH } from "../config.js";
import { isAfcFootprintClear } from "./afc-landing-site.js";
import { landmarkConstructionBlocker, type LandmarkTile } from "./landmark-footprint.js";

describe("AFC landing footprint", () => {
  it("rejects neighbouring structures, resources, water and overlapping AFCs", () => {
    for (const tile of [{ terrain: "SEA" }, { terrain: "LAND", resource: "FARM" }, { terrain: "LAND", fort: {} }]) {
      expect(isAfcFootprintClear((x, y) => x === 11 && y === 10 ? tile : { terrain: "LAND" }, 10, 10)).toBe(false);
    }
    expect(isAfcFootprintClear((x, y) => x === 12 && y === 10 ? { terrain: "LAND", afc: {} } : { terrain: "LAND" }, 10, 10)).toBe(false);
  });
  it("rejects a relic that would overlap the corner of the footprint", () => {
    const tileAt = (x: number, y: number) => x === 12 && y === 12 ? { terrain: "LAND", naturalWonder: {} } : undefined;
    expect(isAfcFootprintClear(tileAt, 10, 10)).toBe(false);
    expect(isAfcFootprintClear(tileAt, 9, 10)).toBe(true);
  });
  it("wraps the footprint at world edges and permits existing mountain flattening", () => {
    expect(isAfcFootprintClear((x, y) => x === WORLD_WIDTH - 1 && y === 10 ? { terrain: "LAND", fort: {} } : { terrain: "LAND" }, 0, 10)).toBe(false);
    expect(isAfcFootprintClear(() => ({ terrain: "MOUNTAIN" }), 10, 10)).toBe(true);
  });
});

it("reserves the center and all eight neighboring tiles, including across the world seam", () => {
  const tiles = new Map<string, LandmarkTile>([[`${WORLD_WIDTH - 1},10`, { afc: {} }], ["10,10", { naturalWonder: {} }]]);
  expect(landmarkConstructionBlocker(tiles, 0, 9)).toBe("AFC");
  expect(landmarkConstructionBlocker(tiles, WORLD_WIDTH - 1, 10)).toBe("AFC");
  expect(landmarkConstructionBlocker(tiles, 1, 9)).toBeUndefined();
  expect(landmarkConstructionBlocker(tiles, 10, 10)).toBe("relic");
  expect(landmarkConstructionBlocker(tiles, 11, 11)).toBe("relic");
  expect(landmarkConstructionBlocker(tiles, 12, 11)).toBeUndefined();
});
