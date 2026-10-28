import { describe, expect, it } from "vitest";
import type { Tile } from "../client-types.js";
import { NAMEPLATE_DETAIL_ZOOM, NAMEPLATE_FULL_ZOOM, nameplateModeAt, townNameplateFor } from "./client-town-nameplate-model.js";

const town = (overrides: Partial<NonNullable<Tile["town"]>> = {}): NonNullable<Tile["town"]> => ({
  name: "Aldmoor", type: "FARMING", baseGoldPerMinute: 1, supportCurrent: 0, supportMax: 0, goldPerMinute: 1, cap: 0,
  isFed: true, population: 20_000, maxPopulation: 100_000, populationGrowthPerMinute: 5, populationTier: "TOWN",
  connectedTownCount: 0, connectedTownBonus: 0, hasManufactory: false, manufactoryActive: false, ...overrides
} as NonNullable<Tile["town"]>);
const tile = (overrides: Partial<Record<keyof Tile, unknown>> = {}): Tile =>
  ({ x: 4, y: 5, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", town: town(), ...overrides }) as Tile;

describe("townNameplateFor", () => {
  it("names an own town with its tier and no status when all is well", () => {
    expect(townNameplateFor(tile(), "me", 0)).toMatchObject({ name: "Aldmoor", tier: "Town", own: true, status: undefined });
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
    expect(townNameplateFor(rival, "me", 0)).toMatchObject({ own: false, status: undefined });
    expect(townNameplateFor(tile({ ownerId: undefined }), "me", 0)).toBeUndefined();
    expect(townNameplateFor(tile({ fogged: true }), "me", 0)).toBeUndefined();
  });
});

describe("nameplateModeAt", () => {
  const own = townNameplateFor(tile(), "me", 0)!;
  const unfed = townNameplateFor(tile({ town: town({ isFed: false, goldPerMinute: 0, populationGrowthPerMinute: 0 }) }), "me", 0)!;
  const rival = townNameplateFor(tile({ ownerId: "rival" }), "me", 0)!;

  it("collapses a troubled own town to a status dot when zoomed out, so the warning never vanishes", () => {
    expect(nameplateModeAt(unfed, NAMEPLATE_FULL_ZOOM - 1, false)).toBe("dot");
    expect(nameplateModeAt(own, NAMEPLATE_FULL_ZOOM - 1, false)).toBe("hidden");
    expect(nameplateModeAt(own, NAMEPLATE_FULL_ZOOM, false)).toBe("full");
  });

  it("holds rival towns and own settlements back until the detail zoom", () => {
    expect(nameplateModeAt(rival, NAMEPLATE_FULL_ZOOM, false)).toBe("hidden");
    expect(nameplateModeAt(rival, NAMEPLATE_DETAIL_ZOOM, false)).toBe("full");
    expect(nameplateModeAt(own, NAMEPLATE_FULL_ZOOM, true)).toBe("hidden");
  });
});
