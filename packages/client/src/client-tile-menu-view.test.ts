import { afterEach, describe, expect, it, vi } from "vitest";

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
  },
  ...(status === "active" ? { upkeepEntries: [{ label: "Fur Synthesizer", perMinute: { GOLD: 5 } }] } : {})
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
  },
  ...(status === "active" ? { upkeepEntries: [{ label: "Observatory", perMinute: { CRYSTAL: 0.03 } }] } : {})
});

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
  areaEffectModifiersForTile: () => [] as TileOverviewModifier[]
};

describe("menuOverviewForTile", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("avoids repeating fed town production in prose and shows connection guidance when isolated", () => {
    const lines = menuOverviewForTile(
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
          supportCurrent: 5,
          supportMax: 5,
          goldPerMinute: 2,
          cap: 40,
          isFed: true,
          population: 22_037,
          maxPopulation: 50_000,
          populationGrowthPerMinute: 16.3,
          populationTier: "TOWN",
          connectedTownCount: 0,
          connectedTownBonus: 0,
          hasMarket: false,
          marketActive: false,
          hasGranary: false,
          granaryActive: false,
          hasBank: false,
          bankActive: false
        },
        yieldRate: {
          goldPerMinute: 2
        }
      },
      {
        ...deps,
        displayTownGoldPerMinute: () => 2,
        populationPerMinuteLabel: () => "+16.3/m",
        townNextGrowthEtaLabel: () => "City in ~4d"
      }
    );

    expect(lines.some((line) => line.html.includes("Town is fed and producing"))).toBe(false);
    expect(lines.some((line) => line.html.includes("Towns produce gold when fed."))).toBe(false);
    expect(lines.some((line) => line.html === "Connected towns 0")).toBe(false);
    expect(lines.some((line) => line.html.includes("Connect this town to other towns to gain bonus gold production."))).toBe(true);
    expect(lines.some((line) => line.html.includes("Production:"))).toBe(true);
  });

  it("uses the modifier section instead of a raw connected-town count when bonuses are active", () => {
    const lines = menuOverviewForTile(
      {
        x: 20,
        y: 44,
        terrain: "LAND",
        ownerId: "me",
        ownershipState: "SETTLED",
        town: {
          name: "Brassford",
          type: "MARKET",
          baseGoldPerMinute: 2,
          supportCurrent: 7,
          supportMax: 8,
          goldPerMinute: 3.8,
          cap: 40,
          isFed: true,
          population: 22_640,
          maxPopulation: 50_000,
          populationGrowthPerMinute: 16.7,
          populationTier: "TOWN",
          connectedTownCount: 2,
          connectedTownBonus: 0.9,
          goldIncomePausedReason: "MANPOWER_NOT_FULL",
          manpowerCurrent: 8,
          manpowerCap: 3_150,
          hasMarket: false,
          marketActive: false,
          hasGranary: false,
          granaryActive: false,
          hasBank: false,
          bankActive: false,
          growthModifiers: [{ label: "Long time peace", deltaPerMinute: 10 }]
        },
        yieldRate: {
          goldPerMinute: 0
        }
      },
      {
        ...deps,
        currentManpower: 8,
        currentManpowerCap: 3_150,
        populationPerMinuteLabel: () => "+16.7/m",
        townNextGrowthEtaLabel: () => "City in ~4d"
      }
    );

    expect(lines.some((line) => line.html === "Connected towns 2")).toBe(false);
    expect(lines.some((line) => line.html.includes("Town is fed but gold is paused until your empire manpower is full."))).toBe(true);
    expect(lines.some((line) => line.html.includes("2 connected towns:"))).toBe(true);
  });

  it("does not show stale manpower-paused copy when current empire manpower is already full", () => {
    const lines = menuOverviewForTile(
      {
        x: 21,
        y: 45,
        terrain: "LAND",
        ownerId: "me",
        ownershipState: "SETTLED",
        town: {
          name: "Brassford",
          type: "MARKET",
          baseGoldPerMinute: 2,
          supportCurrent: 7,
          supportMax: 8,
          goldPerMinute: 3.8,
          cap: 40,
          isFed: true,
          population: 22_640,
          maxPopulation: 50_000,
          populationGrowthPerMinute: 16.7,
          populationTier: "TOWN",
          connectedTownCount: 2,
          connectedTownBonus: 0.9,
          goldIncomePausedReason: "MANPOWER_NOT_FULL",
          manpowerCurrent: 8,
          manpowerCap: 3_150,
          hasMarket: false,
          marketActive: false,
          hasGranary: false,
          granaryActive: false,
          hasBank: false,
          bankActive: false
        },
        yieldRate: {
          goldPerMinute: 0
        }
      },
      {
        ...deps,
        currentManpower: 3_450,
        currentManpowerCap: 3_450,
        populationPerMinuteLabel: () => "+16.7/m",
        townNextGrowthEtaLabel: () => "City in ~4d"
      }
    );

    expect(lines.some((line) => line.html.includes("empire manpower is full"))).toBe(false);
  });

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

  it("calls out recent capture shock separately from overload recovery", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-10T10:00:00.000Z"));
    const now = Date.now();
    const lines = menuOverviewForTile(
      {
        ...settledSupportTile("inactive", now + 119_000),
        history: {
          previousOwners: ["enemy-1"],
          captureCount: 9,
          lastCapturedAt: now - 30_000,
          lastOwnerId: "enemy-1",
          structureHistory: []
        }
      },
      deps
    );

    expect(lines.some((line) => line.html.includes("Recently captured."))).toBe(true);
    expect(lines.some((line) => line.html.includes("capture shock"))).toBe(true);
    expect(lines.some((line) => line.html.includes("recovering from overload"))).toBe(false);
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
    expect(lines.some((line) => line.kind === "section" && line.html === "Upkeep")).toBe(true);
    expect(lines.some((line) => line.html.includes("Observatory:") && line.html.includes("0.03/m"))).toBe(true);
  });

  it("shows a dedicated upkeep section with one row per active upkeep source", () => {
    const lines = menuOverviewForTile(
      {
        x: 30,
        y: 30,
        terrain: "LAND",
        ownerId: "me",
        ownershipState: "SETTLED",
        fort: {
          ownerId: "me",
          status: "active"
        },
        town: {
          name: "Sable",
          type: "MARKET",
          baseGoldPerMinute: 2,
          supportCurrent: 4,
          supportMax: 5,
          goldPerMinute: 2.5,
          cap: 40,
          isFed: true,
          population: 18_000,
          maxPopulation: 50_000,
          populationGrowthPerMinute: 10,
          populationTier: "TOWN",
          connectedTownCount: 1,
          connectedTownBonus: 0.2,
          hasMarket: false,
          marketActive: false,
          hasGranary: false,
          granaryActive: false,
          hasBank: false,
          bankActive: false
        },
        upkeepEntries: [
          { label: "Settled land", perMinute: { GOLD: 0.04 } },
          { label: "Town", perMinute: { FOOD: 1 } },
          { label: "Fort", perMinute: { GOLD: 1, IRON: 0.025 } }
        ],
        yieldRate: {
          goldPerMinute: 2.5
        }
      },
      {
        ...deps,
        populationPerMinuteLabel: () => "+10/m",
        townNextGrowthEtaLabel: () => "City in ~5d"
      }
    );

    expect(lines.some((line) => line.kind === "section" && line.html === "Upkeep")).toBe(true);
    expect(lines.some((line) => line.html.includes("Settled land:") && line.html.includes("0.04/m"))).toBe(true);
    expect(lines.some((line) => line.html.includes("Town:") && line.html.includes("1.00/m"))).toBe(true);
    expect(lines.some((line) => line.html.includes("Fort:") && line.html.includes("1.00/m") && line.html.includes("0.03/m"))).toBe(true);
    expect(lines.some((line) => line.html.startsWith("Upkeep:"))).toBe(false);
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
    expect(lines.some((line) => line.html.includes("+50% iron production"))).toBe(true);
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

  it("shows dock guidance instead of a raw connected-dock count when isolated", () => {
    const lines = menuOverviewForTile(
      {
        x: 75,
        y: 334,
        terrain: "LAND",
        ownerId: "me",
        ownershipState: "SETTLED",
        dockId: "dock-2",
        dock: {
          baseGoldPerMinute: 0.5,
          goldPerMinute: 0.55,
          connectedDockCount: 0,
          modifiers: [{ label: "Dock income bonus", percent: 10, deltaGoldPerMinute: 0.05 }]
        },
        yieldRate: {
          goldPerMinute: 0.55
        }
      },
      deps
    );

    expect(lines.some((line) => line.html === "Connected docks 0")).toBe(false);
    expect(lines.some((line) => line.html.includes("Connect this dock to other docks to gain bonus gold production."))).toBe(true);
  });

  it("hides settled-resource development copy once the tile is already producing", () => {
    const lines = menuOverviewForTile(
      {
        x: 14,
        y: 18,
        terrain: "LAND",
        ownerId: "me",
        ownershipState: "SETTLED",
        resource: "GRAIN",
        economicStructure: {
          ownerId: "me",
          type: "FARMSTEAD",
          status: "active"
        },
        yieldRate: {
          strategicPerDay: { FOOD: 75.6 }
        },
        yield: {
          strategic: { FOOD: 1.75 }
        },
        yieldCap: {
          gold: 0,
          strategicEach: 6
        }
      },
      deps
    );

    expect(lines.some((line) => line.html.includes("once developed and collected"))).toBe(false);
    expect(lines.some((line) => line.html.includes("Production:"))).toBe(true);
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

  it("adds a recent-capture timer to the tile heading when a structure is in capture shock", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-10T10:00:00.000Z"));
    const now = Date.now();
    const menu = tileMenuViewForTile(
      {
        ...settledSupportTile("inactive", now + 119_000),
        history: {
          previousOwners: ["enemy-1"],
          captureCount: 9,
          lastCapturedAt: now - 15_000,
          lastOwnerId: "enemy-1",
          structureHistory: []
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

    expect(menu.statusText).toBe("Recently captured 01:59");
    expect(menu.statusTone).toBe("warning");
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

  it("shows the owner player name instead of enemy text for hostile land", () => {
    const menu = tileMenuViewForTile(
      {
        x: 106,
        y: 171,
        terrain: "LAND",
        ownerId: "enemy-1",
        ownershipState: "SETTLED",
        dockId: "dock-1",
        regionType: "ANCIENT_HEARTLAND"
      },
      {
        ...deps,
        playerNameForOwner: (ownerId?: string | null) => (ownerId === "enemy-1" ? "Ancient Rival" : ownerId ?? undefined),
        menuActionsForSingleTile: () => [],
        splitTileActionsIntoTabs: () => ({ actions: [], buildings: [], crystal: [] }),
        settlementProgressForTile: () => undefined,
        queuedSettlementProgressForTile: () => undefined,
        queuedBuildProgressForTile: () => undefined,
        constructionProgressForTile: () => undefined,
        menuOverviewForTile: () => []
      }
    );

    expect(menu.subtitle).toBe("Ancient Rival · ANCIENT_HEARTLAND");
    expect(menu.subtitleHtml).toBeUndefined();
  });

  it("renders allied owner names with the ally subtitle accent", () => {
    const menu = tileMenuViewForTile(
      {
        x: 80,
        y: 120,
        terrain: "LAND",
        ownerId: "ally-1",
        ownershipState: "SETTLED",
        town: {
          name: "Harborlight",
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
        },
        regionType: "ANCIENT_HEARTLAND"
      },
      {
        ...deps,
        playerNameForOwner: (ownerId?: string | null) => (ownerId === "ally-1" ? "Green Banner" : ownerId ?? undefined),
        isTileOwnedByAlly: () => true,
        menuActionsForSingleTile: () => [],
        splitTileActionsIntoTabs: () => ({ actions: [], buildings: [], crystal: [] }),
        settlementProgressForTile: () => undefined,
        queuedSettlementProgressForTile: () => undefined,
        queuedBuildProgressForTile: () => undefined,
        constructionProgressForTile: () => undefined,
        menuOverviewForTile: () => []
      }
    );

    expect(menu.subtitle).toBe("Green Banner · ANCIENT_HEARTLAND");
    expect(menu.subtitleHtml).toBe('<span class="tile-owner-label is-ally">Green Banner</span> · ANCIENT_HEARTLAND');
  });
});
