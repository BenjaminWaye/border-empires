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
  // selecting an active Relay Beacon never showed the aura sweep-range
  // overlay even though Relay Beacons grant the same attack aura bonus.
  it("returns true for an active owned Relay Beacon", () => {
    const tile: Tile = {
      ...baseTile(2, 2),
      economicStructure: { ownerId: "p1", type: "RELAY_BEACON", status: "active" }
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

  it("returns false when the Relay Beacon is owned by another player", () => {
    const tile: Tile = {
      ...baseTile(4, 4),
      economicStructure: { ownerId: "enemy", type: "RELAY_BEACON", status: "active" }
    };
    expect(hasActiveOwnedOutpostAura(tile, "p1")).toBe(false);
  });

  it("returns false when the economic structure is a different type", () => {
    const tile: Tile = {
      ...baseTile(5, 5),
      economicStructure: { ownerId: "p1", type: "MINTWORKS", status: "active" }
    };
    expect(hasActiveOwnedOutpostAura(tile, "p1")).toBe(false);
  });

  it("returns false for a tile with no outpost structures", () => {
    expect(hasActiveOwnedOutpostAura(baseTile(6, 6), "p1")).toBe(false);
  });
});
