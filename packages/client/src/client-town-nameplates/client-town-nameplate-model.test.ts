import { describe, expect, it } from "vitest";
import type { Tile } from "../client-types.js";
import { formatPlatePopulation, townNameplateFor } from "./client-town-nameplate-model.js";

const town = (overrides: Partial<NonNullable<Tile["town"]>> = {}): NonNullable<Tile["town"]> => ({
  name: "Aldmoor", type: "FARMING", baseGoldPerMinute: 1, supportCurrent: 0, supportMax: 0, goldPerMinute: 1, cap: 0,
  isFed: true, population: 20_000, maxPopulation: 100_000, populationGrowthPerMinute: 5, populationTier: "TOWN",
  connectedTownCount: 0, connectedTownBonus: 0, hasManufactory: false, manufactoryActive: false, ...overrides
} as NonNullable<Tile["town"]>);
const tile = (overrides: Partial<Record<keyof Tile, unknown>> = {}): Tile =>
  ({ x: 4, y: 5, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", town: town(), ...overrides }) as Tile;

describe("townNameplateFor", () => {
  it("names an own town with its population and no status when all is well", () => {
    expect(townNameplateFor(tile(), "me", 0)).toMatchObject({ name: "Aldmoor", ownerId: "me", own: true, status: undefined, population: 20_000 });
  });

  it("flags an own unfed town, matching the tile-menu unfed gate", () => {
    const unfed = tile({ town: town({ isFed: false, goldPerMinute: 0, populationGrowthPerMinute: 0 }) });
    expect(townNameplateFor(unfed, "me", 0)?.status).toBe("unfed");
  });

  it("flags upgrade-ready and nearby-war, with war outranking upgrade", () => {
    const ready = town({ nextPopulationTierUpgrade: { available: true } } as Partial<NonNullable<Tile["town"]>>);
    expect(townNameplateFor(tile({ town: ready }), "me", 0)?.status).toBe("upgrade");
    const atWar = { ...ready, nearbyWarPausedUntil: 10_000 } as NonNullable<Tile["town"]>;
    expect(townNameplateFor(tile({ town: atWar }), "me", 0)?.status).toBe("war");
  });

  it("never shows status on a rival's town, and skips neutral or fogged towns", () => {
    const rival = tile({ ownerId: "rival", town: town({ isFed: false, goldPerMinute: 0, populationGrowthPerMinute: 0 }) });
    expect(townNameplateFor(rival, "me", 0)).toMatchObject({ own: false, status: undefined, population: undefined });
    expect(townNameplateFor(tile({ ownerId: undefined }), "me", 0)).toBeUndefined();
    expect(townNameplateFor(tile({ fogged: true }), "me", 0)).toBeUndefined();
  });
});

describe("formatPlatePopulation", () => {
  it("shortens population to fit the end of a plate", () => {
    expect(formatPlatePopulation(940)).toBe("940");
    expect(formatPlatePopulation(9_800)).toBe("9.8k");
    expect(formatPlatePopulation(2_000)).toBe("2k");
    expect(formatPlatePopulation(48_200)).toBe("48k");
    expect(formatPlatePopulation(999_700)).toBe("1M");
    expect(formatPlatePopulation(1_400_000)).toBe("1.4M");
  });
});
