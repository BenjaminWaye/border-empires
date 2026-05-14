import { describe, expect, it } from "vitest";

import { menuActionsForSingleTile } from "./client-tile-action-logic.js";
import { createInitialState } from "./client-state.js";
import type { Tile } from "./client-types.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;

const baseDeps = {
  keyFor,
  parseKey: (k: string) => {
    const [x, y] = k.split(",").map(Number);
    return { x, y };
  },
  wrapX: (x: number) => x,
  wrapY: (y: number) => y,
  terrainAt: (_x: number, _y: number) => "LAND" as const,
  chebyshevDistanceClient: () => 0,
  isTileOwnedByAlly: () => false,
  hostileObservatoryProtectingTile: () => undefined,
  abilityCooldownRemainingMs: () => 0,
  formatCooldownShort: () => "",
  pushFeed: () => undefined,
  hideTileActionMenu: () => undefined,
  hideHoldBuildMenu: () => undefined,
  selectedTile: () => undefined,
  renderHud: () => undefined,
  requireAuthedSession: () => true,
  ws: { readyState: 1, send: () => undefined },
  attackPreviewDetailForTarget: () => undefined,
  attackPreviewPendingForTarget: () => false,
  pickOriginForTarget: () => undefined,
  buildDetailTextForAction: () => undefined,
  developmentSlotSummary: () => ({ used: 0, limit: 3, available: 3, busy: 0 }),
  developmentSlotReason: () => "",
  structureGoldCost: () => 0,
  structureCostText: () => "",
  supportedOwnedTownsForTile: () => [],
  supportedOwnedDocksForTile: () => [],
  townHasSupportStructure: () => false,
  activeTruceWithPlayer: () => undefined,
  pendingTruceWithPlayer: () => undefined,
  ownerSpawnShieldActive: () => false
} as const;

describe("town growth tile actions", () => {
  it("shows a city growth action once a town is ready", () => {
    const state = createInitialState();
    state.me = "me";
    state.gold = 4_000;
    const tile: Tile = {
      x: 12,
      y: 8,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      town: {
        name: "Asterford",
        type: "MARKET",
        baseGoldPerMinute: 2,
        supportCurrent: 5,
        supportMax: 5,
        goldPerMinute: 3,
        cap: 100,
        isFed: true,
        population: 120_000,
        maxPopulation: 10_000_000,
        populationGrowthPerMinute: 12,
        populationTier: "TOWN",
        connectedTownCount: 0,
        connectedTownBonus: 0,
        hasMarket: false,
        marketActive: false,
        hasGranary: false,
        granaryActive: false,
        hasBank: false,
        bankActive: false,
        nextPopulationTierUpgrade: {
          targetTier: "CITY",
          requiredPopulation: 100_000,
          goldCost: 1_500,
          available: true
        }
      }
    };

    const action = menuActionsForSingleTile(state, tile, baseDeps as never).find((entry) => entry.id === "grow_town_to_city");

    expect(action).toMatchObject({
      id: "grow_town_to_city",
      label: "Grow Town to City",
      cost: "1500 gold",
      detail: "Unlocks city-tier income and manpower. Food upkeep rises to 0.2/m."
    });
    expect(action?.disabled).toBe(false);
  });

  it("keeps the growth action disabled when gold is short", () => {
    const state = createInitialState();
    state.me = "me";
    state.gold = 1_000;
    const tile: Tile = {
      x: 12,
      y: 8,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      town: {
        name: "Asterford",
        type: "MARKET",
        baseGoldPerMinute: 2,
        supportCurrent: 5,
        supportMax: 5,
        goldPerMinute: 3,
        cap: 100,
        isFed: true,
        population: 120_000,
        maxPopulation: 10_000_000,
        populationGrowthPerMinute: 12,
        populationTier: "TOWN",
        connectedTownCount: 0,
        connectedTownBonus: 0,
        hasMarket: false,
        marketActive: false,
        hasGranary: false,
        granaryActive: false,
        hasBank: false,
        bankActive: false,
        nextPopulationTierUpgrade: {
          targetTier: "CITY",
          requiredPopulation: 100_000,
          goldCost: 1_500,
          available: true
        }
      }
    };

    const action = menuActionsForSingleTile(state, tile, baseDeps as never).find((entry) => entry.id === "grow_town_to_city");

    expect(action).toMatchObject({
      id: "grow_town_to_city",
      disabled: true,
      disabledReason: "Need 1500 gold",
      cost: "1500 gold"
    });
  });

  it("shows a monumental city growth action for great cities", () => {
    const state = createInitialState();
    state.me = "me";
    state.gold = 20_000;
    const tile: Tile = {
      x: 14,
      y: 9,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      town: {
        name: "Highspire",
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
        populationTier: "GREAT_CITY",
        connectedTownCount: 2,
        connectedTownBonus: 0.2,
        hasMarket: false,
        marketActive: false,
        hasGranary: false,
        granaryActive: false,
        hasBank: false,
        bankActive: false,
        nextPopulationTierUpgrade: {
          targetTier: "METROPOLIS",
          requiredPopulation: 5_000_000,
          goldCost: 15_000,
          available: true
        }
      }
    };

    const action = menuActionsForSingleTile(state, tile, baseDeps as never).find((entry) => entry.id === "grow_great_city_to_monumental_city");

    expect(action).toMatchObject({
      id: "grow_great_city_to_monumental_city",
      label: "Grow Great City to Monumental City",
      cost: "15000 gold",
      detail: "Unlocks metropolis-tier income and manpower. Food upkeep rises to 0.8/m."
    });
    expect(action?.disabled).toBe(false);
  });

});
