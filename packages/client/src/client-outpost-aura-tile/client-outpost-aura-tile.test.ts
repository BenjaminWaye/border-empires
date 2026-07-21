import { describe, expect, it } from "vitest";
import { hasActiveOwnedOutpostAura } from "./client-outpost-aura-tile.js";
import type { Tile } from "../client-types.js";

const baseTile = (x: number, y: number): Tile => ({
  x,
  y,
  terrain: "LAND",
  ownerId: "p1",
  ownershipState: "SETTLED"
});

describe("hasActiveOwnedOutpostAura", () => {
  it("returns true for an active owned siege outpost", () => {
    const tile: Tile = {
      ...baseTile(1, 1),
      siegeOutpost: { ownerId: "p1", status: "active" }
    };
    expect(hasActiveOwnedOutpostAura(tile, "p1")).toBe(true);
  });

  // Regression: previously the 3D map only checked `tile.siegeOutpost`, so
  // selecting an active light outpost never showed the aura sweep-range
  // overlay even though light outposts grant the same attack aura bonus.
  it("returns true for an active owned light outpost", () => {
    const tile: Tile = {
      ...baseTile(2, 2),
      economicStructure: { ownerId: "p1", type: "LIGHT_OUTPOST", status: "active" }
    };
    expect(hasActiveOwnedOutpostAura(tile, "p1")).toBe(true);
  });

  it("returns false when the siege outpost is under construction", () => {
    const tile: Tile = {
      ...baseTile(3, 3),
      siegeOutpost: { ownerId: "p1", status: "under_construction" }
    };
    expect(hasActiveOwnedOutpostAura(tile, "p1")).toBe(false);
  });

  it("returns false when the light outpost is owned by another player", () => {
    const tile: Tile = {
      ...baseTile(4, 4),
      economicStructure: { ownerId: "enemy", type: "LIGHT_OUTPOST", status: "active" }
    };
    expect(hasActiveOwnedOutpostAura(tile, "p1")).toBe(false);
  });

  it("returns false when the economic structure is a different type", () => {
    const tile: Tile = {
      ...baseTile(5, 5),
      economicStructure: { ownerId: "p1", type: "MARKET", status: "active" }
    };
    expect(hasActiveOwnedOutpostAura(tile, "p1")).toBe(false);
  });

  it("returns false for a tile with no outpost structures", () => {
    expect(hasActiveOwnedOutpostAura(baseTile(6, 6), "p1")).toBe(false);
  });
});
