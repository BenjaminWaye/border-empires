import { afterEach, describe, expect, it, vi } from "vitest";

import { buildDetailTextForAction, constructionProgressForTile, menuOverviewForTile, tileMenuViewForTile } from "./client-tile-menu-view.js";
import type { TileOverviewModifier } from "../client-tile-overview-modifiers/client-tile-overview-modifiers.js";
import type { Tile } from "../client-types.js";

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
  areaEffectModifiersForTile: () => [] as TileOverviewModifier[],
  townPartialLoadingStartedAt: () => Date.now()
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
    expect(lines.some((line) => line.html.includes("Connect this town to other towns to gain bonus gold production."))).toBe(true); expect(lines.some((line) => line.html.includes("Production:"))).toBe(true);
  });

  it("shows active support building contribution for a clicked Clearing House", () => { const lines = menuOverviewForTile({ x: 9, y: 9, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", economicStructure: { ownerId: "me", type: "CLEARING_HOUSE", status: "active" } }, { ...deps, supportedOwnedTownsForTile: () => [{ x: 10, y: 10, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", town: { name: "Qadarstrand", type: "FARMING", baseGoldPerMinute: 2, supportCurrent: 5, supportMax: 5, goldPerMinute: 7.45, cap: 100, isFed: true, population: 18_977, maxPopulation: 25_000, populationTier: "TOWN", connectedTownCount: 0, connectedTownBonus: 0, hasMarket: true, marketActive: true, hasGranary: true, granaryActive: true, hasBank: true, bankActive: true } }] }); expect(lines.map((line) => line.html)).toContain("Clearing House contributes to Qadarstrand and directly connected towns: +25% Market effect, +20% Bank effect, +0.5 Bank gold/m."); });
  it("uses Monumental City in the overview label for the final tier", () => {
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
        populationPerMinuteLabel: () => "+80/m",
        townNextGrowthEtaLabel: () => "Max tier reached"
      }
    );

    expect(lines.some((line) => line.html.includes("Population 5,400,000 • Monumental City"))).toBe(true);
  });

  it("falls back to zero settlement gold when snapshot detail is missing the numeric rate", () => {
    const lines = menuOverviewForTile(
      {
        x: 19,
        y: 43,
        terrain: "LAND",
        ownerId: "me",
        ownershipState: "SETTLED",
        town: {
          name: "Qadarstrand Mast",
          type: "MARKET",
          baseGoldPerMinute: 0,
          supportCurrent: 0,
          supportMax: 0,
          goldPerMinute: 0,
          cap: 40,
          isFed: true,
          population: 1,
          maxPopulation: 10_000,
          populationTier: "SETTLEMENT",
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
          goldPerMinute: 0
        }
      },
      {
        ...deps,
        displayTownGoldPerMinute: () => Number.NaN
      }
    );

    // The duplicated prose income line ("Settlement is producing X gold/m.") was removed
    // because the unified `Production:` row already displays the same value. We assert it
    // is gone to lock in the dedupe.
    expect(lines.some((line) => line.html.includes("Settlement is producing"))).toBe(false);
  });

  it("renders Production/Support/Upkeep loading rows when own settled town arrives without owner-economy fields", () => {
    const startedAt = 1_700_000_000_000;
    const lines = menuOverviewForTile(
      {
        x: 29,
        y: 228,
        terrain: "LAND",
        ownerId: "me",
        ownershipState: "SETTLED",
        // Mirrors the wire shape of a TILE_DELTA_BATCH town payload — public
        // fields only (type/tier/population/maxPopulation/connected*), no
        // isFed/goldPerMinute/supportCurrent/supportMax/foodUpkeepPerMinute.
        // The detail panel must not silently render Production: 0.00/m here;
        // it must surface a loader + timer + Report button per row so the
        // gap between TILE_DELTA and the follow-up REQUEST_TILE_DETAIL is
        // visible to the player.
        town: {
          name: "Sableythspire Manse",
          type: "MARKET",
          population: 20_638,
          maxPopulation: 50_000,
          populationTier: "TOWN",
          connectedTownCount: 0,
          connectedTownBonus: 0
        } as NonNullable<Tile["town"]>
      },
      {
        ...deps,
        townPartialLoadingStartedAt: () => startedAt
      }
    );

    const loadingLines = lines.filter((line) => line.kind === "loading");
    const loadingLabels = loadingLines.map((line) => {
      const match = /<strong>([^<]+):<\/strong>/.exec(line.html);
      return match ? match[1] : "";
    });
    expect(loadingLabels).toEqual(["Support", "Growth", "Production", "Upkeep"]);
    expect(loadingLines.every((line) => line.html.includes(`data-loading-timer-since="${startedAt}"`))).toBe(true);
    expect(loadingLines.every((line) => line.html.includes('data-tile-debug-download="29,228"'))).toBe(true);
    // The misleading "Production: ◉ 0.00/m" row must not render under a partial payload.
    expect(lines.some((line) => line.kind !== "loading" && line.html.startsWith("Production:"))).toBe(false);
    // And the bare "Support 0/0" line is similarly suppressed in favor of the loader.
    expect(lines.some((line) => line.html === "Support 0/0")).toBe(false);
    // Growth/Next-size also stay hidden under their loader rather than dropping silently.
    expect(lines.some((line) => line.html.startsWith("Growth ") || line.html.startsWith("Next size:"))).toBe(false);
  });

  it("shows neutral town stats without owned-only economy guidance", () => {
    const lines = menuOverviewForTile(
      {
        x: 41,
        y: 52,
        terrain: "LAND",
        upkeepEntries: [{ label: "Town", perMinute: { FOOD: 0.1 } }],
        town: {
          name: "Galehaven",
          type: "MARKET",
          baseGoldPerMinute: 2,
          supportCurrent: 0,
          supportMax: 0,
          goldPerMinute: 0,
          cap: 40,
          isFed: false,
          population: 18_400,
          maxPopulation: 50_000,
          populationGrowthPerMinute: 0,
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
        populationPerMinuteLabel: () => "0/m",
        townNextGrowthEtaLabel: () => "never"
      }
    );

    expect(lines.some((line) => line.html.includes("Neutral town. Claim and settle this tile to start its economy."))).toBe(true);
    expect(lines.some((line) => line.html.includes("Population 18,400"))).toBe(true);
    expect(lines.some((line) => line.html.includes("Growth 0/m"))).toBe(false);
    expect(lines.some((line) => line.html.includes("Next size: never."))).toBe(false);
    expect(lines.some((line) => line.html.includes("Town is unfed"))).toBe(false);
    expect(lines.some((line) => line.html.includes("Support 0/0"))).toBe(false);
    expect(lines.some((line) => line.html.includes("Connect this town to other towns"))).toBe(false);
    expect(lines.some((line) => line.kind === "section" && line.html === "Upkeep")).toBe(false);
    expect(lines.some((line) => line.html.includes("Town:") && line.html.includes("0.10/m"))).toBe(false);
  });

  it("hides post-settle town stats and prompts settle on a frontier-claimed town", () => {
    const lines = menuOverviewForTile(
      {
        x: 51,
        y: 179,
        terrain: "LAND",
        ownerId: "me",
        ownershipState: "FRONTIER",
        town: {
          name: "Bramblefiddlenook Bridge",
          type: "MARKET",
          baseGoldPerMinute: 2,
          supportCurrent: 0,
          supportMax: 0,
          goldPerMinute: 0,
          cap: 40,
          isFed: false,
          population: 16_000,
          maxPopulation: 50_000,
          populationGrowthPerMinute: 0,
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
        populationPerMinuteLabel: () => "0/m",
        townNextGrowthEtaLabel: () => "never"
      }
    );

    expect(lines.some((line) => line.html.includes("Settle this tile to activate the town's economy"))).toBe(true);
    expect(lines.some((line) => line.html.includes("Population 16,000"))).toBe(true);
    expect(lines.some((line) => line.html.includes("Support 0/0"))).toBe(false);
    expect(lines.some((line) => line.html.includes("Town is unfed"))).toBe(false);
    expect(lines.some((line) => line.html.includes("Connect this town to other towns"))).toBe(false);
    expect(lines.some((line) => line.html.includes("Growth"))).toBe(false);
    expect(lines.some((line) => line.html.includes("Next size:"))).toBe(false);
    // Frontier-with-town should NOT also show the generic "Frontier land is visible control..."
    // intro — the town-specific Settle prompt covers it.
    expect(lines.some((line) => line.html.includes("Frontier land is visible control"))).toBe(false);
    expect(lines.some((line) => line.html.includes("Needs settlement to produce"))).toBe(false);
    // No Production / Upkeep / Stored yield rows for non-settled.
    expect(lines.some((line) => line.html.includes("Production:"))).toBe(false);
    expect(lines.some((line) => line.kind === "section" && line.html === "Upkeep")).toBe(false);
    expect(lines.some((line) => line.html.includes("Stored yield:"))).toBe(false);
  });

  it("hides the unfed warning when the town is producing gold or growing population (stale isFed flag)", () => {
    const lines = menuOverviewForTile(
      {
        x: 22,
        y: 50,
        terrain: "LAND",
        ownerId: "me",
        ownershipState: "SETTLED",
        town: {
          name: "Goldenford",
          type: "MARKET",
          baseGoldPerMinute: 2,
          supportCurrent: 0,
          supportMax: 7,
          goldPerMinute: 2,
          cap: 40,
          isFed: false,
          population: 17_532,
          maxPopulation: 50_000,
          populationGrowthPerMinute: 5.6,
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
        populationPerMinuteLabel: () => "+5.6/m",
        townNextGrowthEtaLabel: () => "City in ~11d"
      }
    );

    expect(lines.some((line) => line.html.includes("Town is unfed"))).toBe(false);
    expect(lines.some((line) => line.html.includes("Population 17,532"))).toBe(true);
    expect(lines.some((line) => line.html.includes("Growth"))).toBe(true);
  });

  it("hides stale unfed town copy when global food coverage is full", () => {
    const nextGrowthLabel = vi.fn(() => "City growth paused");
    const lines = menuOverviewForTile(
      {
        x: 29,
        y: 251,
        terrain: "LAND",
        ownerId: "me",
        ownershipState: "SETTLED",
        town: {
          name: "Merrymarket",
          type: "MARKET",
          baseGoldPerMinute: 2,
          supportCurrent: 4,
          supportMax: 4,
          goldPerMinute: 0,
          cap: 0,
          isFed: false,
          population: 21_277,
          maxPopulation: 25_000,
          populationGrowthPerMinute: 0,
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
          goldPerMinute: 0
        }
      },
      {
        ...deps,
        state: { me: "me", upkeepLastTick: { foodCoverage: 1 } },
        townNextGrowthEtaLabel: nextGrowthLabel
      }
    );

    expect(lines.some((line) => line.html.includes("Town is unfed"))).toBe(false);
    expect(lines.some((line) => line.html.includes("town is unfed"))).toBe(false);
    expect(nextGrowthLabel).toHaveBeenCalledWith(expect.objectContaining({ isFed: true }), { explainUnfed: true });
  });

  it("does not show support or road-bonus UI for settlements even if stale town fields are present", () => {
    const lines = menuOverviewForTile(
      {
        x: 19,
        y: 44,
        terrain: "LAND",
        ownerId: "me",
        ownershipState: "SETTLED",
        town: {
          name: "Nauticus Mast",
          type: "MARKET",
          baseGoldPerMinute: 0,
          supportCurrent: 2,
          supportMax: 6,
          goldPerMinute: 0.8,
          cap: 40,
          isFed: true,
          population: 4_000,
          maxPopulation: 10_000,
          populationTier: "SETTLEMENT",
          connectedTownCount: 3,
          connectedTownBonus: 0.9,
          hasMarket: false,
          marketActive: false,
          hasGranary: false,
          granaryActive: false,
          hasBank: false,
          bankActive: false
        },
        yieldRate: {
          goldPerMinute: 0.8
        }
      },
      {
        ...deps,
        displayTownGoldPerMinute: () => 0.8
      }
    );

    expect(lines.some((line) => line.html.includes("Support 2/6"))).toBe(false);
    expect(lines.some((line) => line.html.includes("Connect this town to other towns"))).toBe(false);
    expect(lines.some((line) => line.html.includes("connected towns:"))).toBe(false);
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

  it("shows a crystal-casting recharge countdown on our own active observatory still on cooldown", () => {
    const tile = settledObservatoryTile("active");
    tile.observatory!.cooldownUntil = Date.now() + 90_000;
    const lines = menuOverviewForTile(tile, deps);
    expect(lines.some((line) => line.html.includes("Crystal casting recharging") && line.html.includes("01:3"))).toBe(true);
  });

  it("omits the recharge countdown once the observatory cooldown has elapsed", () => {
    const tile = settledObservatoryTile("active");
    tile.observatory!.cooldownUntil = Date.now() - 1_000;
    const lines = menuOverviewForTile(tile, deps);
    expect(lines.some((line) => line.html.includes("Crystal casting recharging"))).toBe(false);
  });

  it("omits the recharge countdown for a foreign observatory on cooldown", () => {
    const tile = settledObservatoryTile("active");
    tile.ownerId = "enemy";
    tile.observatory!.ownerId = "enemy";
    tile.observatory!.cooldownUntil = Date.now() + 90_000;
    const lines = menuOverviewForTile(tile, deps);
    expect(lines.some((line) => line.html.includes("Crystal casting recharging"))).toBe(false);
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
            { label: "Harbor Exchange", percent: 50, deltaGoldPerMinute: 0.275 }
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
    expect(lines.some((line) => line.html.includes("Harbor Exchange:"))).toBe(true);
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

  it("does not show stored yield for owned unfed towns", () => {
    const lines = menuOverviewForTile(
      {
        x: 350,
        y: 219,
        terrain: "LAND",
        ownerId: "me",
        ownershipState: "SETTLED",
        town: {
          name: "Rivetstead Causeway",
          type: "MARKET",
          baseGoldPerMinute: 2,
          supportCurrent: 5,
          supportMax: 5,
          goldPerMinute: 0,
          cap: 0,
          isFed: false,
          population: 15_590,
          maxPopulation: 50_000,
          populationGrowthPerMinute: 4.98,
          populationTier: "TOWN",
          connectedTownCount: 0,
          connectedTownBonus: 0,
          hasMarket: false,
          marketActive: false,
          hasGranary: false,
          granaryActive: false,
          hasBank: false,
          bankActive: false,
          foodUpkeepPerMinute: 0.1
        },
        yieldRate: {
          goldPerMinute: 2
        }
      },
      {
        ...deps,
        populationPerMinuteLabel: () => "+4.98/m",
        townNextGrowthEtaLabel: () => "City in ~12d"
      }
    );

    expect(lines.some((line) => line.html.startsWith("Stored yield:"))).toBe(false);
  });

  it("does not force stored yield visible for non-owned towns with no gold or cap", () => {
    const lines = menuOverviewForTile(
      {
        x: 351,
        y: 219,
        terrain: "LAND",
        ownerId: "rival",
        ownershipState: "SETTLED",
        town: {
          name: "Enemy Causeway",
          type: "MARKET",
          baseGoldPerMinute: 2,
          supportCurrent: 5,
          supportMax: 5,
          goldPerMinute: 0,
          cap: 0,
          isFed: true,
          population: 15_590,
          maxPopulation: 50_000,
          populationGrowthPerMinute: 4.98,
          populationTier: "TOWN",
          connectedTownCount: 0,
          connectedTownBonus: 0,
          hasMarket: false,
          marketActive: false,
          hasGranary: false,
          granaryActive: false,
          hasBank: false,
          bankActive: false,
          foodUpkeepPerMinute: 0.1
        },
        yieldRate: {
          goldPerMinute: 2
        }
      },
      {
        ...deps,
        populationPerMinuteLabel: () => "+4.98/m",
        townNextGrowthEtaLabel: () => "City in ~12d"
      }
    );

    expect(lines.some((line) => line.html.startsWith("Stored yield:"))).toBe(false);
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

  it("adds a recent-capture timer to the tile heading when a town is in capture shock", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-10T10:00:00.000Z"));
    const now = Date.now();
    const menu = tileMenuViewForTile(
      {
        x: 18,
        y: 42,
        terrain: "LAND",
        ownerId: "ai-1",
        ownershipState: "FRONTIER",
        town: {
          name: "Aetherwick",
          type: "MARKET",
          baseGoldPerMinute: 2,
          supportCurrent: 0,
          supportMax: 0,
          goldPerMinute: 0,
          cap: 0,
          isFed: false,
          population: 22_037,
          maxPopulation: 50_000,
          populationGrowthPerMinute: 0,
          populationTier: "TOWN",
          connectedTownCount: 0,
          connectedTownBonus: 0,
          hasMarket: false,
          marketActive: false,
          hasGranary: false,
          granaryActive: false,
          hasBank: false,
          bankActive: false,
          captureShockUntil: now + 119_000
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

  it("shows a spinner and debug-download button when a town payload arrived but failed the renderable gate", () => {
    const lines = menuOverviewForTile(
      {
        x: 117,
        y: 248,
        terrain: "LAND",
        ownerId: "rival",
        ownershipState: "SETTLED",
        townType: "MARKET",
        townPopulationTier: "TOWN",
        townDataPartial: true
      },
      deps
    );

    const loadingLine = lines.find((line) => line.kind === "loading");
    expect(loadingLine).toBeDefined();
    expect(loadingLine?.html).toContain("tile-town-loading-spinner");
    expect(loadingLine?.html).toContain("Loading town details…");
    expect(loadingLine?.html).toContain('data-tile-debug-download="117,248"');
    expect(loadingLine?.html).toContain('aria-live="polite"');
  });

  it("renders foreign-visibility towns without owner-only economy lines when private fields are absent", () => {
    // Foreign towns under satellite reveal carry only public fields. The
    // overview pane should show the public summary (population, tier) and
    // skip private guidance like "Town is unfed" or "Support 0/0".
    const lines = menuOverviewForTile(
      {
        x: 200,
        y: 200,
        terrain: "LAND",
        ownerId: "rival",
        ownershipState: "SETTLED",
        town: {
          name: "Foreign Capital",
          type: "MARKET",
          populationTier: "CITY",
          population: 42_000,
          maxPopulation: 80_000,
          // Owner-only fields intentionally absent — server stripped them.
        } as unknown as NonNullable<Tile["town"]>
      },
      deps
    );

    expect(lines.some((line) => line.html.includes("Population 42,000"))).toBe(true);
    expect(lines.some((line) => line.html.includes("Town is unfed"))).toBe(false);
    expect(lines.some((line) => line.html.includes("Support 0/0"))).toBe(false);
    expect(lines.some((line) => line.html.startsWith("Next size:"))).toBe(false);
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

describe("buildDetailTextForAction fort tier text", () => {
  const emptyTile: Tile = { x: 10, y: 10, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" };
  const fortTile: Tile = { ...emptyTile, fort: { ownerId: "me", status: "active" } };
  const ironTile: Tile = { ...emptyTile, fort: { ownerId: "me", status: "active", variant: "IRON_BASTION" } };
  const thunderTile: Tile = { ...emptyTile, fort: { ownerId: "me", status: "active", variant: "THUNDER_BASTION" } };
  const woodenFortTile: Tile = { ...emptyTile, economicStructure: { ownerId: "me", type: "WOODEN_FORT", status: "active" } };

  it("shows 'Fortify this tile' for a tile with no fort (no regression to upgrade text)", () => {
    const detail = buildDetailTextForAction("build_fortification", emptyTile);
    expect(detail).toContain("Fortify this tile");
    expect(detail).not.toContain("Upgrade");
  });

  it("shows 'Upgrade this Wooden Fort' for a wooden-fort tile", () => {
    const detail = buildDetailTextForAction("build_fortification", woodenFortTile);
    expect(detail).toContain("Upgrade this Wooden Fort");
  });

  it("shows Iron Bastion upgrade text for an active fort with undefined variant", () => {
    const detail = buildDetailTextForAction("build_fortification", fortTile);
    expect(detail).toContain("Upgrade this Fort into an Iron Bastion");
    expect(detail).toContain("4x");
  });

  it("shows Thunder Bastion upgrade text for an Iron Bastion", () => {
    const detail = buildDetailTextForAction("build_fortification", ironTile);
    expect(detail).toContain("Upgrade this Iron Bastion into a Thunder Bastion");
    expect(detail).toContain("8x");
  });

  it("falls through (no upgrade text) for a Thunder Bastion", () => {
    const detail = buildDetailTextForAction("build_fortification", thunderTile);
    // Should not show upgrade text for a max-tier fort
    expect(detail).toBeDefined();
    expect(detail).not.toContain("Upgrade");
    expect(detail).not.toContain("Bastion");
  });
});
