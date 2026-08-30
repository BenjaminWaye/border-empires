import { describe, expect, it } from "vitest";
import { tileOverviewUpkeepLines } from "./client-tile-upkeep-view.js";
import type { Tile } from "./client-types.js";

const baseTile = (): Tile => ({
  x: 0,
  y: 0,
  terrain: "LAND",
  ownerId: "me",
  ownershipState: "SETTLED"
});

describe("tileOverviewUpkeepLines", () => {
  // Regression: Observatory's progressive CRYSTAL slot upkeep (see
  // tile-detail-snapshot-observatory-upkeep.test.ts) never showed up in the
  // tile overview's Upkeep section at all -- neither the per-minute entry
  // path (Observatory has no per-minute drain) nor the fort/siege/economic
  // slotLinesForTile path (which never had an Observatory case).
  it("shows the Observatory's CRYSTAL slot count sent from the server", () => {
    const tile: Tile = {
      ...baseTile(),
      observatory: { ownerId: "me", status: "active" },
      upkeepEntries: [{ label: "Observatory", perMinute: {}, slot: { resource: "CRYSTAL", count: 2 } }]
    };

    const lines = tileOverviewUpkeepLines(tile);

    expect(lines.some((line) => line.html === "Observatory: 2 CRYSTAL slots")).toBe(true);
  });

  it("uses singular 'slot' for a count of 1", () => {
    const tile: Tile = {
      ...baseTile(),
      observatory: { ownerId: "me", status: "active" },
      upkeepEntries: [{ label: "Observatory", perMinute: {}, slot: { resource: "CRYSTAL", count: 1 } }]
    };

    const lines = tileOverviewUpkeepLines(tile);

    expect(lines.some((line) => line.html === "Observatory: 1 CRYSTAL slot")).toBe(true);
  });

  it("shows nothing when there is no upkeep at all", () => {
    const tile: Tile = baseTile();

    expect(tileOverviewUpkeepLines(tile)).toEqual([]);
  });
});
