import { describe, expect, it } from "vitest";
import { WORLD_WIDTH } from "../config.js";
import { isAfcFootprintClear } from "./afc-landing-site.js";

describe("AFC landing footprint", () => {
  it("rejects neighbouring structures, resources, water and overlapping AFCs", () => {
    for (const tile of [{ terrain: "SEA" }, { terrain: "LAND", resource: "FARM" }, { terrain: "LAND", fort: {} }]) {
      expect(isAfcFootprintClear((x, y) => x === 11 && y === 10 ? tile : { terrain: "LAND" }, 10, 10)).toBe(false);
    }
    expect(isAfcFootprintClear((x, y) => x === 12 && y === 10 ? { terrain: "LAND", afc: {} } : { terrain: "LAND" }, 10, 10)).toBe(false);
  });
  it("wraps the footprint at world edges and permits existing mountain flattening", () => {
    expect(isAfcFootprintClear((x, y) => x === WORLD_WIDTH - 1 && y === 10 ? { terrain: "LAND", fort: {} } : { terrain: "LAND" }, 0, 10)).toBe(false);
    expect(isAfcFootprintClear(() => ({ terrain: "MOUNTAIN" }), 10, 10)).toBe(true);
  });
});
