import { describe, expect, it } from "vitest";

import { shouldRefreshTileDetailOnPress, shouldSendTileDetailRequest } from "../client-action-flow.js";
import type { Tile } from "../client-types.js";

const fullOwnedTile = (overrides: Partial<Tile> = {}): Tile => ({
  x: 12,
  y: 34,
  terrain: "LAND",
  fogged: false,
  ownerId: "me",
  ownershipState: "SETTLED",
  detailLevel: "full",
  ...overrides
});

describe("tile detail refresh on press", () => {
  it("forces a detail request for a visible pressed tile even when the cached tile is already full", () => {
    const tile = fullOwnedTile();

    expect(shouldRefreshTileDetailOnPress(tile, "visible")).toBe(true);
    expect(shouldSendTileDetailRequest(tile, "me")).toBe(false);
    expect(shouldSendTileDetailRequest(tile, "me", { force: true })).toBe(true);
  });

  it("re-requests detail for an owned town whose growth rate hasn't arrived even when the cached tile is full", () => {
    const town: NonNullable<Tile["town"]> = {
      type: "MARKET",
      populationTier: "TOWN",
      baseGoldPerMinute: 2,
      supportCurrent: 8,
      supportMax: 8,
      goldPerMinute: 3.8,
      cap: 40,
      isFed: true,
      population: 23_052,
      maxPopulation: 100_000,
      connectedTownCount: 0,
      connectedTownBonus: 0,
      hasMintworks: false,
      mintworksActive: false,
      hasIncubationEngine: false,
      incubationEngineActive: false
    };

    expect(shouldSendTileDetailRequest(fullOwnedTile({ town }), "me")).toBe(true);
    expect(shouldSendTileDetailRequest(fullOwnedTile({ town: { ...town, populationGrowthPerMinute: 4.2 } }), "me")).toBe(false);
  });

  it("does not refresh fogged or unexplored pressed tiles", () => {
    expect(shouldRefreshTileDetailOnPress(fullOwnedTile({ fogged: true }), "fogged")).toBe(false);
    expect(shouldRefreshTileDetailOnPress(undefined, "unexplored")).toBe(false);
  });
});
