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

  it("does not refresh fogged or unexplored pressed tiles", () => {
    expect(shouldRefreshTileDetailOnPress(fullOwnedTile({ fogged: true }), "fogged")).toBe(false);
    expect(shouldRefreshTileDetailOnPress(undefined, "unexplored")).toBe(false);
  });
});
