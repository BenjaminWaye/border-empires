import { describe, expect, it } from "vitest";
import { shouldDrawForestInstance } from "./client-map-3d-forest-structure-gate.js";
import type { Tile } from "./client-types.js";

const baseTile = { x: 0, y: 0, terrain: "LAND" } as Tile;

describe("shouldDrawForestInstance", () => {
  it("draws the forest instance on a forest tile with no structure", () => {
    expect(shouldDrawForestInstance(true, baseTile)).toBe(true);
  });

  it("skips the forest instance once a structure is built on the tile", () => {
    const built: Tile = {
      ...baseTile,
      economicStructure: { ownerId: "p1", type: "MINE", status: "active" }
    };
    expect(shouldDrawForestInstance(true, built)).toBe(false);
  });

  it("skips when the tile isn't a forest tile at all, structure or not", () => {
    expect(shouldDrawForestInstance(false, baseTile)).toBe(false);
  });

  it("draws when there is no tile data yet (nothing built there)", () => {
    expect(shouldDrawForestInstance(true, undefined)).toBe(true);
  });
});
