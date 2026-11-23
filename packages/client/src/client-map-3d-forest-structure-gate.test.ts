import { NETWORK_RESOURCES } from "@border-empires/shared";
import { describe, expect, it } from "vitest";
import { forestTreeKeepSlot, shouldDrawForestInstance } from "./client-map-3d-forest-structure-gate.js";
import type { Tile } from "./client-types.js";

const baseTile = { x: 0, y: 0, terrain: "LAND" } as Tile;

describe("shouldDrawForestInstance", () => {
  it("draws the forest instance on a forest tile with no structure", () => {
    expect(shouldDrawForestInstance(true, baseTile)).toBe(true);
  });

  it("skips the forest instance once a structure is built on the tile", () => {
    const built: Tile = {
      ...baseTile,
      economicStructure: { ownerId: "p1", type: "MANUFACTORY", status: "active" }
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


it("keeps frontier resource plots readable through forest canopy", () => {
  for (const resource of NETWORK_RESOURCES)
    expect(shouldDrawForestInstance(true, { ...baseTile, resource })).toBe(false);
});

describe("forestTreeKeepSlot", () => {
  it("leaves an ordinary forest tile's trees alone", () => {
    expect(forestTreeKeepSlot(baseTile, undefined, 3, 3)).toBeUndefined();
    expect(forestTreeKeepSlot({ ...baseTile, resource: "TITANIUM" }, "TITANIUM", 3, 3)).toBeUndefined();
  });

  it("clears a space for an Umbrite deposit drawn on the tile", () => {
    const keepByTile = Array.from({ length: 40 }, (_, wx) => forestTreeKeepSlot({ ...baseTile, resource: "UMBRITE" }, "UMBRITE", wx, 3));
    expect(keepByTile.every((keep) => keep !== undefined)).toBe(true);
    expect(keepByTile.some((keep) => [0, 1, 2, 3, 4, 5, 6, 7, 8].some((slot) => !keep!(slot)))).toBe(true);
  });
});
