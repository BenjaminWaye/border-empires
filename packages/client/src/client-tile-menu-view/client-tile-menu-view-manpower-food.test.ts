import { describe, expect, it } from "vitest";

import { menuOverviewForTile } from "./client-tile-menu-view.js";
import type { Tile } from "../client-types.js";

// Manpower/Food stat-grid tests, kept in a dedicated file rather than
// added to client-tile-menu-view.test.ts, which is already well over the
// repo's 500-line soft cap (see client-tile-menu-view-dormancy.test.ts for
// the same split rationale). Population/Gold/Manpower/Support/Food render
// as a single "statgrid" kind line (client-town-stat-grid.ts) for a settled
// own town with full owner-economy data — these tests read that line's html.
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

const statGridHtml = (lines: ReturnType<typeof menuOverviewForTile>): string | undefined =>
  lines.find((line) => line.kind === "statgrid")?.html;

describe("menuOverviewForTile — town stat grid", () => {
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
        },
        yieldRate: { goldPerMinute: 3.8 }
      },
      { ...deps, populationPerMinuteLabel: () => "+16.7/m", townNextGrowthEtaLabel: () => "City in ~4d" }
    );

    const html = statGridHtml(lines);
    expect(html).toContain("300");
    expect(html).toContain("+0.42/min base regen");
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
        },
        yieldRate: { goldPerMinute: 3.8 }
      },
      { ...deps, populationPerMinuteLabel: () => "+16.7/m", townNextGrowthEtaLabel: () => "City in ~4d" }
    );

    const html = statGridHtml(lines);
    expect(html).toContain("4 / 4");
    expect(html).not.toContain("unfed");
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
        },
        yieldRate: { goldPerMinute: 0 }
      },
      {
        ...deps,
        // hasFullFoodCoverage defaults to true (upkeepLastTick undefined),
        // which staleness-overrides isFed back to true for the growth
        // calculation (see the "stale isFed flag" test in
        // client-tile-menu-view.test.ts) — force real low coverage here so
        // this actually exercises the unfed/growth-paused path.
        state: { me: "me", upkeepLastTick: { foodCoverage: 0 } },
        populationPerMinuteLabel: () => "+0.0/m",
        townNextGrowthEtaLabel: () => "unfed"
      }
    );

    const html = statGridHtml(lines);
    expect(html).toContain("0 / 4");
    expect(html).toContain("unfed");
    expect(html).toContain("Growth paused — town is unfed");
  });

  it("omits Support/Food for a SETTLEMENT-tier town (no support ring, 0 slot demand)", () => {
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
        },
        yieldRate: { goldPerMinute: 0.2 }
      },
      deps
    );

    const html = statGridHtml(lines);
    expect(html).toBeDefined();
    expect(html).not.toContain("tile-stat-mini-row");
  });

  it("shows Gold production in gold/day, matching tileProductionHtml's math", () => {
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
        },
        yieldRate: { goldPerMinute: 3.8 }
      },
      { ...deps, populationPerMinuteLabel: () => "+16.7/m", townNextGrowthEtaLabel: () => "City in ~4d" }
    );

    const html = statGridHtml(lines);
    expect(html).toContain("5,472.0");
    expect(html).toContain("/ day");
  });

  it("uses Monumental City in the stat grid label for the final tier", () => {
    const lines = menuOverviewForTile(
      {
        x: 20,
        y: 45,
        terrain: "LAND",
        ownerId: "me",
        ownershipState: "SETTLED",
        town: {
          name: "Skyhold",
          type: "MARKET",
          baseGoldPerMinute: 2,
          supportCurrent: 8,
          supportMax: 8,
          goldPerMinute: 12,
          cap: 300,
          isFed: true,
          population: 5_400_000,
          maxPopulation: 10_000_000,
          populationGrowthPerMinute: 80,
          populationTier: "METROPOLIS",
          connectedTownCount: 2,
          connectedTownBonus: 0.2,
          hasMintworks: false,
          mintworksActive: false,
          hasGranary: false,
          granaryActive: false
        }
      },
      {
        ...deps,
        populationPerMinuteLabel: () => "+80/m",
        townNextGrowthEtaLabel: () => "Max tier reached"
      }
    );

    const html = statGridHtml(lines);
    expect(html).toContain("5,400,000");
    expect(html).toContain("Population · Monumental City");
  });
});
