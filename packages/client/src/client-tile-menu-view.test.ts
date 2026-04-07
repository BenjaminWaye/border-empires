import { describe, expect, it } from "vitest";

import { constructionProgressForTile, menuOverviewForTile, tileMenuViewForTile } from "./client-tile-menu-view.js";
import type { TileOverviewModifier } from "./client-tile-overview-modifiers.js";
import type { Tile } from "./client-types.js";

const settledSupportTile = (
  status: NonNullable<Tile["economicStructure"]>["status"],
  disabledUntil?: number,
  inactiveReason?: NonNullable<Tile["economicStructure"]>["inactiveReason"]
): Tile => ({
  x: 90,
  y: 329,
  terrain: "LAND",
  ownerId: "me",
  ownershipState: "SETTLED",
  economicStructure: {
    ownerId: "me",
    type: "FUR_SYNTHESIZER",
    status,
    ...(disabledUntil !== undefined ? { disabledUntil } : {}),
    ...(inactiveReason !== undefined ? { inactiveReason } : {})
  }
});

const settledObservatoryTile = (status: NonNullable<Tile["observatory"]>["status"]): Tile => ({
  x: 85,
  y: 164,
  terrain: "LAND",
  ownerId: "me",
  ownershipState: "SETTLED",
  observatory: {
    ownerId: "me",
    status
  }
});

const deps = {
  state: { me: "me" },
  prettyToken: (value: string) => value,
  terrainLabel: (_x: number, _y: number, terrain: Tile["terrain"]) => terrain,
  displayTownGoldPerMinute: () => 0,
  populationPerMinuteLabel: () => "0/m",
  townNextGrowthEtaLabel: () => "never",
  supportedOwnedTownsForTile: () => [] as Tile[],
  connectedDockCountForTile: () => 0,
  hostileObservatoryProtectingTile: () => undefined,
  constructionCountdownLineForTile: () => "",
  tileHistoryLines: () => [] as string[],
  isTileOwnedByAlly: () => false,
  areaEffectModifiersForTile: () => [] as TileOverviewModifier[]
};

describe("menuOverviewForTile", () => {
  it("calls out active synth structures explicitly", () => {
    const lines = menuOverviewForTile(settledSupportTile("active"), deps);
    expect(lines.some((line) => line.html.includes("currently contributing output and upkeep"))).toBe(true);
  });

  it("calls out inactive support structures", () => {
    const lines = menuOverviewForTile(settledSupportTile("inactive"), deps);
    expect(lines.some((line) => line.html.includes("currently contributes no output or upkeep"))).toBe(true);
  });

  it("distinguishes overloaded recovery from generic inactivity", () => {
    const lines = menuOverviewForTile(settledSupportTile("inactive", Date.now() + 60_000), deps);
    expect(lines.some((line) => line.html.includes("disabled while recovering from overload"))).toBe(true);
  });

  it("calls out synths shut down by missing upkeep until manually enabled", () => {
    const lines = menuOverviewForTile(settledSupportTile("inactive", undefined, "upkeep"), deps);
    expect(lines.some((line) => line.html.includes("must be manually re-enabled"))).toBe(true);
  });

  it("calls out manually disabled synths", () => {
    const lines = menuOverviewForTile(settledSupportTile("inactive", undefined, "manual"), deps);
    expect(lines.some((line) => line.html.includes("manually disabled"))).toBe(true);
  });

  it("describes active observatories and their crystal upkeep", () => {
    const lines = menuOverviewForTile(settledObservatoryTile("active"), deps);
    expect(lines.some((line) => line.html.includes("Observatory"))).toBe(true);
    expect(lines.some((line) => line.html.includes("blocks hostile crystal actions nearby"))).toBe(true);
    expect(lines.some((line) => line.html.includes("0.03/m"))).toBe(true);
  });

  it("calls out removal as disabling structure income, upkeep, and effects", () => {
    const lines = menuOverviewForTile(settledSupportTile("removing"), deps);
    expect(lines.some((line) => line.html.includes("Removal is underway"))).toBe(true);
    expect(lines.some((line) => line.html.includes("effects are currently disabled"))).toBe(true);
  });

  it("shows area-effect modifiers in the overview", () => {
    const lines = menuOverviewForTile(
      {
        x: 12,
        y: 14,
        terrain: "LAND",
        ownerId: "me",
        ownershipState: "SETTLED",
        resource: "IRON",
        economicStructure: {
          ownerId: "me",
          type: "MINE",
          status: "active"
        }
      },
      {
        ...deps,
        areaEffectModifiersForTile: () => [{ reason: "Foundry", effect: "+100% iron production", tone: "positive" }]
      }
    );

    expect(lines.some((line) => line.kind === "section" && line.html === "Modifiers")).toBe(true);
    expect(lines.some((line) => line.html.includes("Mine:"))).toBe(true);
    expect(lines.some((line) => line.html.includes("+50% production output"))).toBe(true);
    expect(lines.some((line) => line.html.includes("Foundry:"))).toBe(true);
    expect(lines.some((line) => line.html.includes("+100% iron production"))).toBe(true);
  });

  it("shows town and dock modifiers in a dedicated modifiers section", () => {
    const lines = menuOverviewForTile(
      {
        x: 75,
        y: 333,
        terrain: "LAND",
        ownerId: "me",
        ownershipState: "SETTLED",
        town: {
          name: "Aetherwick",
          type: "MARKET",
          baseGoldPerMinute: 1.5,
          supportCurrent: 1,
          supportMax: 2,
          goldPerMinute: 2.85,
          cap: 40,
          isFed: true,
          population: 25_000,
          maxPopulation: 50_000,
          populationGrowthPerMinute: 20,
          populationTier: "CITY",
          connectedTownCount: 2,
          connectedTownBonus: 0.9,
          hasMarket: false,
          marketActive: false,
          hasGranary: false,
          granaryActive: false,
          hasBank: false,
          bankActive: false,
          growthModifiers: [{ label: "Long time peace", deltaPerMinute: 10 }]
        },
        dockId: "dock-1",
        dock: {
          baseGoldPerMinute: 0.5,
          goldPerMinute: 0.825,
          connectedDockCount: 1,
          modifiers: [
            { label: "Connected dock route", percent: 50, deltaGoldPerMinute: 0.275 },
            { label: "Customs House", percent: 50, deltaGoldPerMinute: 0.275 }
          ]
        },
        yieldRate: {
          goldPerMinute: 0.825
        }
      },
      deps
    );

    expect(lines.some((line) => line.kind === "section" && line.html === "Modifiers")).toBe(true);
    expect(lines.some((line) => line.html.includes("Long-term peace:"))).toBe(true);
    expect(lines.some((line) => line.html.includes("+100% population growth"))).toBe(true);
    expect(lines.some((line) => line.html.includes("2 connected towns:"))).toBe(true);
    expect(lines.some((line) => line.html.includes("+90% gold production"))).toBe(true);
    expect(lines.some((line) => line.html.includes("Connected dock route:"))).toBe(true);
    expect(lines.some((line) => line.html.includes("Customs House:"))).toBe(true);
  });

  it("shows building-specific removal progress timing", () => {
    const progress = constructionProgressForTile(
      {
        ...settledSupportTile("removing"),
        economicStructure: {
          ownerId: "me",
          type: "LIGHT_OUTPOST",
          status: "removing",
          completesAt: Date.now() + 45_000
        }
      },
      () => "0:45"
    );

    expect(progress?.title).toBe("Removing Light Outpost");
    expect(progress?.remainingLabel).toBe("0:45");
    expect(progress?.cancelLabel).toBe("Cancel removal");
    expect(progress?.note).toContain("Income, upkeep, and structure effects are paused");
    expect(progress?.progress).toBeCloseTo(0.25, 2);
  });

  it("shows fort removal progress with disabled-defense copy", () => {
    const progress = constructionProgressForTile(
      {
        x: 4,
        y: 4,
        terrain: "LAND",
        ownerId: "me",
        ownershipState: "SETTLED",
        fort: {
          ownerId: "me",
          status: "removing",
          completesAt: Date.now() + 5 * 60_000
        }
      },
      () => "5:00"
    );

    expect(progress?.title).toBe("Removing Fort");
    expect(progress?.note).toContain("Defense from this fort is disabled");
  });

  it("uses the generated town name in the pressed-town title", () => {
    const menu = tileMenuViewForTile(
      {
        x: 18,
        y: 42,
        terrain: "LAND",
        ownerId: "me",
        ownershipState: "SETTLED",
        town: {
          name: "Aetherwick",
          type: "MARKET",
          baseGoldPerMinute: 2,
          supportCurrent: 0,
          supportMax: 0,
          goldPerMinute: 2,
          cap: 40,
          isFed: true,
          population: 18_000,
          maxPopulation: 50_000,
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
      },
      {
        ...deps,
        menuActionsForSingleTile: () => [],
        splitTileActionsIntoTabs: () => ({ actions: [], buildings: [], crystal: [] }),
        settlementProgressForTile: () => undefined,
        queuedSettlementProgressForTile: () => undefined,
        queuedBuildProgressForTile: () => undefined,
        constructionProgressForTile: () => undefined,
        menuOverviewForTile: () => []
      }
    );

    expect(menu.title).toBe("Aetherwick (18, 42)");
  });
});
