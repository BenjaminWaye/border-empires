import { describe, expect, it } from "vitest";
import type { Tile } from "../client-types.js";
import {
  createInitialTownTierUpgradeFxState,
  recordTownTierUpgrade,
  TOWN_TIER_CELEBRATION_MAX_MS,
  townTierCelebrationFrame,
  townTierCelebrationProfile,
  townTierUpgradedTo
} from "./client-town-tier-upgrade-fx.js";

const townTile = (ownerId: string, populationTier: NonNullable<Tile["townPopulationTier"]>): Tile =>
  ({ x: 1, y: 2, terrain: "LAND", ownerId, ownershipState: "SETTLED", town: { populationTier } }) as unknown as Tile;

describe("townTierUpgradedTo", () => {
  it("returns the new tier when the viewer's town steps up", () => {
    expect(townTierUpgradedTo(townTile("me", "TOWN"), townTile("me", "CITY"), "me")).toBe("CITY");
    expect(townTierUpgradedTo({ ownerId: "me", townPopulationTier: "SETTLEMENT" }, townTile("me", "TOWN"), "me")).toBe("TOWN");
  });

  it("ignores captures, foreign towns, first sightings, unchanged and lower tiers", () => {
    expect(townTierUpgradedTo(townTile("enemy", "TOWN"), townTile("me", "CITY"), "me")).toBeUndefined();
    expect(townTierUpgradedTo(townTile("enemy", "TOWN"), townTile("enemy", "CITY"), "me")).toBeUndefined();
    expect(townTierUpgradedTo(undefined, townTile("me", "CITY"), "me")).toBeUndefined();
    expect(townTierUpgradedTo({ ownerId: "me" }, townTile("me", "CITY"), "me")).toBeUndefined();
    expect(townTierUpgradedTo(townTile("me", "CITY"), townTile("me", "CITY"), "me")).toBeUndefined();
    expect(townTierUpgradedTo(townTile("me", "GREAT_CITY"), townTile("me", "CITY"), "me")).toBeUndefined();
  });
});

describe("townTierCelebrationProfile", () => {
  it("gets bigger and longer with every tier", () => {
    const tiers = ["TOWN", "CITY", "GREAT_CITY", "METROPOLIS"] as const;
    const profiles = tiers.map(townTierCelebrationProfile);
    for (let i = 1; i < profiles.length; i += 1) {
      expect(profiles[i]!.rings).toBeGreaterThan(profiles[i - 1]!.rings);
      expect(profiles[i]!.sparks).toBeGreaterThan(profiles[i - 1]!.sparks);
      expect(profiles[i]!.durationMs).toBeGreaterThan(profiles[i - 1]!.durationMs);
      expect(profiles[i]!.ringRadiusTiles).toBeGreaterThan(profiles[i - 1]!.ringRadiusTiles);
    }
    expect(TOWN_TIER_CELEBRATION_MAX_MS).toBe(profiles[3]!.durationMs);
  });
});

describe("townTierCelebrationFrame", () => {
  it("plays from flash to fade and ends after its duration", () => {
    const profile = townTierCelebrationProfile("CITY");
    expect(townTierCelebrationFrame(profile, -1)).toBeUndefined();
    const early = townTierCelebrationFrame(profile, profile.durationMs * 0.05)!;
    expect(early.flash).toBeGreaterThan(0.5);
    expect(early.rings[0]!.alpha).toBeGreaterThan(0);
    const mid = townTierCelebrationFrame(profile, profile.durationMs * 0.4)!;
    expect(mid.pillarAlpha).toBe(1);
    expect(mid.rings.filter((ring) => ring.alpha > 0).length).toBeGreaterThan(1);
    expect(townTierCelebrationFrame(profile, profile.durationMs)).toBeUndefined();
  });
});

describe("recordTownTierUpgrade", () => {
  it("feeds both renderers and prunes finished 2D entries", () => {
    const state = createInitialTownTierUpgradeFxState();
    recordTownTierUpgrade(state, "1,2", { x: 1, y: 2, tier: "CITY", startedAt: 1_000 });
    recordTownTierUpgrade(state, "3,4", { x: 3, y: 4, tier: "TOWN", startedAt: 1_000 + TOWN_TIER_CELEBRATION_MAX_MS });
    expect([...state.townTierUpgradeFxByKey.keys()]).toEqual(["3,4"]);
    expect(state.townTierUpgradeFxQueue.map((entry) => entry.tier)).toEqual(["CITY", "TOWN"]);
  });
});
