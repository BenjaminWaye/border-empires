import { describe, expect, it } from "vitest";

import { menuOverviewForTile } from "./client-tile-menu-view.js";
import type { Tile } from "../client-types.js";

// Manpower/Food overview-line tests, kept in a dedicated file rather than
// added to client-tile-menu-view.test.ts, which is already well over the
// repo's 500-line soft cap (see client-tile-menu-view-dormancy.test.ts for
// the same split rationale).
const deps = {
  state: { me: "me" },
  prettyToken: (value: string) => value,
  playerNameForOwner: (ownerId?: string | null) => ownerId ?? undefined,
  terrainLabel: (_x: number, _y: number, terrain: Tile["terrain"]) => terrain,
  displayTownGoldPerMinute: () => 0,
  populationPerMinuteLabel: () => "0/m",
  townNextGrowthEtaLabel: () => "never",
  supportedOwnedTownsForTile: () => [] as Tile[],
  connectedDockCountForTile: () => 0,
  currentManpower: 100,
  currentManpowerCap: 100,
  hostileObservatoryProtectingTile: () => undefined,
  constructionCountdownLineForTile: () => "",
  tileHistoryLines: () => [] as string[],
  isTileOwnedByAlly: () => false,
  areaEffectModifiersForTile: () => [],
  townPartialLoadingStartedAt: () => Date.now()
};

describe("menuOverviewForTile — Manpower/Food lines", () => {
  it("shows the town's base manpower cap/regen contribution", () => {
    const lines = menuOverviewForTile(
      {
        x: 30,
        y: 60,
        terrain: "LAND",
        ownerId: "me",
        ownershipState: "SETTLED",
        town: {
          name: "Millhaven",
          type: "MARKET",
          baseGoldPerMinute: 2,
          supportCurrent: 8,
          supportMax: 8,
          goldPerMinute: 3.8,
          cap: 40,
          isFed: true,
          population: 22_640,
          maxPopulation: 50_000,
          populationGrowthPerMinute: 16.7,
          populationTier: "TOWN",
          connectedTownCount: 0,
          connectedTownBonus: 0,
          hasMintworks: false,
          mintworksActive: false,
          hasGranary: false,
          granaryActive: false
        }
      },
      { ...deps, populationPerMinuteLabel: () => "+16.7/m", townNextGrowthEtaLabel: () => "City in ~4d" }
    );

    expect(lines.some((line) => line.html === "Manpower: +300 cap, +0.42/min base regen")).toBe(true);
  });

  // Regression test: townFoodSlotDemandForTier("TOWN") is 4 — the town's
  // whole FOOD demand is satisfied (fed) or not (unfed), never partial, so
  // this must read as 4/4 or 0/4, never a fractional in-between.
  it("shows Food as N/N slots when the town is fed", () => {
    const lines = menuOverviewForTile(
      {
        x: 30,
        y: 60,
        terrain: "LAND",
        ownerId: "me",
        ownershipState: "SETTLED",
        town: {
          name: "Millhaven",
          type: "MARKET",
          baseGoldPerMinute: 2,
          supportCurrent: 8,
          supportMax: 8,
          goldPerMinute: 3.8,
          cap: 40,
          isFed: true,
          population: 22_640,
          maxPopulation: 50_000,
          populationGrowthPerMinute: 16.7,
          populationTier: "TOWN",
          connectedTownCount: 0,
          connectedTownBonus: 0,
          hasMintworks: false,
          mintworksActive: false,
          hasGranary: false,
          granaryActive: false
        }
      },
      { ...deps, populationPerMinuteLabel: () => "+16.7/m", townNextGrowthEtaLabel: () => "City in ~4d" }
    );

    expect(lines.some((line) => line.html === "Food 4/4 slots")).toBe(true);
  });

  it("shows Food as 0/N slots when the town is unfed", () => {
    const lines = menuOverviewForTile(
      {
        x: 30,
        y: 60,
        terrain: "LAND",
        ownerId: "me",
        ownershipState: "SETTLED",
        town: {
          name: "Millhaven",
          type: "MARKET",
          baseGoldPerMinute: 2,
          supportCurrent: 8,
          supportMax: 8,
          goldPerMinute: 0,
          cap: 40,
          isFed: false,
          population: 22_640,
          maxPopulation: 50_000,
          populationGrowthPerMinute: 0,
          populationTier: "TOWN",
          connectedTownCount: 0,
          connectedTownBonus: 0,
          hasMintworks: false,
          mintworksActive: false,
          hasGranary: false,
          granaryActive: false
        }
      },
      { ...deps, populationPerMinuteLabel: () => "+0.0/m", townNextGrowthEtaLabel: () => "unfed" }
    );

    expect(lines.some((line) => line.html === "Food 0/4 slots")).toBe(true);
  });

  it("does not show a Food line for a SETTLEMENT-tier town (0 slot demand)", () => {
    const lines = menuOverviewForTile(
      {
        x: 30,
        y: 60,
        terrain: "LAND",
        ownerId: "me",
        ownershipState: "SETTLED",
        town: {
          name: "New Camp",
          type: "MARKET",
          baseGoldPerMinute: 2,
          supportCurrent: 0,
          supportMax: 0,
          goldPerMinute: 0.2,
          cap: 10,
          isFed: true,
          population: 500,
          maxPopulation: 1_000,
          populationTier: "SETTLEMENT",
          connectedTownCount: 0,
          connectedTownBonus: 0,
          hasMintworks: false,
          mintworksActive: false,
          hasGranary: false,
          granaryActive: false
        }
      },
      deps
    );

    expect(lines.some((line) => line.html.startsWith("Food "))).toBe(false);
  });
});
