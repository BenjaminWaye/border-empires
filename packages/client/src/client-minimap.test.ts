import { beforeAll, describe, expect, it } from "vitest";
import type { Tile } from "./client-types.js";

let miniMapTownMarkerPalette: typeof import("./client-minimap.js").miniMapTownMarkerPalette;

beforeAll(async () => {
  class MockImage {
    decoding = "";
    src = "";
  }
  Object.assign(globalThis, { Image: MockImage });
  ({ miniMapTownMarkerPalette } = await import("./client-minimap.js"));
});

const townTile = (isFed: boolean): Tile => ({
  x: 1,
  y: 1,
  terrain: "LAND",
  ownershipState: "SETTLED",
  ownerId: "me",
  town: {
    type: "MARKET",
    baseGoldPerMinute: 2,
    supportCurrent: 1,
    supportMax: 1,
    goldPerMinute: 2,
    cap: 100,
    isFed,
    population: 20_000,
    maxPopulation: 100_000,
    populationTier: "TOWN",
    connectedTownCount: 0,
    connectedTownBonus: 0,
    hasMarket: false,
    marketActive: false,
    hasGranary: false,
    granaryActive: false,
    hasBank: false,
    bankActive: false
  }
});

describe("miniMapTownMarkerPalette", () => {
  it("does not use a red warning outer marker for unfed towns", () => {
    const fed = miniMapTownMarkerPalette(townTile(true), false);
    const unfed = miniMapTownMarkerPalette(townTile(false), false);
    expect(unfed.outer).toBe(fed.outer);
    expect(unfed.outer).toBe("rgba(6, 10, 18, 0.86)");
  });
});
