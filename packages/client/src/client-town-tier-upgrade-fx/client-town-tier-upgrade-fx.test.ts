import { describe, expect, it } from "vitest";
import type { Tile } from "../client-types.js";
import {
  createInitialTownTierUpgradeFxState,
  isTownGrowthActive,
  recordTownTierUpgrade,
  TOWN_GROWTH_DUST_MS,
  TOWN_GROWTH_SINK_MS,
  TOWN_GROWTH_START_MS,
  TOWN_GROWTH_TRANSITION_MS,
  townGrowthDustPuffAt,
  townGrowthRise,
  townGrowthSink,
  townTierUpgradeStep
} from "./client-town-tier-upgrade-fx.js";

const townTile = (ownerId: string, populationTier: NonNullable<Tile["townPopulationTier"]>): Tile =>
  ({ x: 1, y: 2, terrain: "LAND", ownerId, ownershipState: "SETTLED", town: { populationTier } }) as unknown as Tile;

describe("townTierUpgradeStep", () => {
  it("returns the step when the viewer's town moves up a tier", () => {
    expect(townTierUpgradeStep(townTile("me", "TOWN"), townTile("me", "CITY"), "me")).toEqual({ fromTier: "TOWN", tier: "CITY" });
    expect(townTierUpgradeStep({ ownerId: "me", townPopulationTier: "SETTLEMENT" }, townTile("me", "TOWN"), "me")).toEqual({ fromTier: "SETTLEMENT", tier: "TOWN" });
  });

  it("ignores captures, foreign towns, first sightings, unchanged and lower tiers", () => {
    expect(townTierUpgradeStep(townTile("enemy", "TOWN"), townTile("me", "CITY"), "me")).toBeUndefined();
    expect(townTierUpgradeStep(townTile("enemy", "TOWN"), townTile("enemy", "CITY"), "me")).toBeUndefined();
    expect(townTierUpgradeStep(undefined, townTile("me", "CITY"), "me")).toBeUndefined();
    expect(townTierUpgradeStep({ ownerId: "me" }, townTile("me", "CITY"), "me")).toBeUndefined();
    expect(townTierUpgradeStep(townTile("me", "CITY"), townTile("me", "CITY"), "me")).toBeUndefined();
    expect(townTierUpgradeStep(townTile("me", "GREAT_CITY"), townTile("me", "CITY"), "me")).toBeUndefined();
  });
});

describe("growth timeline", () => {
  it("sinks the old town before the new one rises", () => {
    expect(townGrowthSink(0)).toBe(1);
    expect(townGrowthSink(TOWN_GROWTH_SINK_MS)).toBe(0);
    expect(townGrowthRise(TOWN_GROWTH_START_MS, 0)).toBe(0);
  });

  it("raises central buildings first, springs past full height and settles by the end", () => {
    const age = TOWN_GROWTH_START_MS + 600;
    expect(townGrowthRise(age, 0)).toBeGreaterThan(townGrowthRise(age, 0.6));
    const peak = Math.max(...Array.from({ length: 50 }, (_, i) => townGrowthRise(TOWN_GROWTH_START_MS + i * 20, 0)));
    expect(peak).toBeGreaterThan(1);
    expect(townGrowthRise(TOWN_GROWTH_TRANSITION_MS, 1)).toBe(1);
  });

  it("is active only during the transition", () => {
    const entry = { x: 0, y: 0, fromTier: "TOWN", tier: "CITY", startedAt: 1_000 } as const;
    expect(isTownGrowthActive(entry, 999)).toBe(false);
    expect(isTownGrowthActive(entry, 1_000)).toBe(true);
    expect(isTownGrowthActive(entry, 1_000 + TOWN_GROWTH_TRANSITION_MS)).toBe(false);
    expect(isTownGrowthActive(undefined, 1_000)).toBe(false);
  });

  it("kicks up dust that has settled by the end", () => {
    const shown = Array.from({ length: 20 }, (_, i) => townGrowthDustPuffAt(7, i, TOWN_GROWTH_START_MS + 1000)).filter((p) => p.radius > 0);
    expect(shown.length).toBeGreaterThan(0);
    expect(Array.from({ length: 20 }, (_, i) => townGrowthDustPuffAt(7, i, TOWN_GROWTH_DUST_MS)).every((p) => p.radius === 0)).toBe(true);
  });
});

describe("recordTownTierUpgrade", () => {
  it("feeds both renderers and prunes finished entries", () => {
    const state = createInitialTownTierUpgradeFxState();
    recordTownTierUpgrade(state, "1,2", { x: 1, y: 2, fromTier: "TOWN", tier: "CITY", startedAt: 1_000 });
    recordTownTierUpgrade(state, "3,4", { x: 3, y: 4, fromTier: "SETTLEMENT", tier: "TOWN", startedAt: 1_000 + TOWN_GROWTH_DUST_MS });
    expect([...state.townTierUpgradeFxByKey.keys()]).toEqual(["3,4"]);
    expect(state.townTierUpgradeFxQueue.map((entry) => entry.tier)).toEqual(["CITY", "TOWN"]);
  });
});
