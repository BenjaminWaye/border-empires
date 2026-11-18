import { describe, expect, it } from "vitest";

import { ownTownDetailRecoveryNeeded } from "./client-tile-menu-town-economy.js";
import type { Tile } from "../client-types.js";

const townTile = (town: Partial<NonNullable<Tile["town"]>>): Tile =>
  ({
    x: 1,
    y: 2,
    terrain: "LAND",
    ownerId: "me",
    ownershipState: "SETTLED",
    town: { type: "MARKET", populationTier: "TOWN", population: 20_000, maxPopulation: 100_000, ...town }
  }) as Tile;

describe("ownTownDetailRecoveryNeeded", () => {
  it("asks for tile detail when an own fed town is missing its coin figure", () => {
    expect(ownTownDetailRecoveryNeeded(townTile({ isFed: true, populationGrowthPerMinute: 17.9 }), "me")).toBe(true);
  });

  it("does not ask once coin and growth rate are both present", () => {
    expect(ownTownDetailRecoveryNeeded(townTile({ isFed: true, populationGrowthPerMinute: 17.9, goldPerMinute: 2.4 }), "me")).toBe(false);
  });

  it("ignores another player's town", () => {
    expect(ownTownDetailRecoveryNeeded(townTile({ isFed: true, populationGrowthPerMinute: 17.9 }), "someone-else")).toBe(false);
  });
});
