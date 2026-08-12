import { describe, expect, it } from "vitest";

import { menuActionsForSingleTile } from "../client-tile-action-logic/client-tile-action-logic.js";
import { createInitialState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";

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
  selectedTile: () => undefined,
  renderHud: () => undefined,
  requireAuthedSession: () => true,
  ws: { readyState: 1, send: () => undefined },
  attackPreviewDetailForTarget: () => undefined,
  attackPreviewPendingForTarget: () => false,
  attackPreviewManpowerCostForTarget: () => undefined,
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
  it("shows a settlement-to-town upgrade with a free FOOD slot and enough gold", () => {
    const state = createInitialState();
    state.me = "me";
    state.gold = 20;
    state.resourceSlots.supply.FOOD = 1;
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
        population: 10_000,
        maxPopulation: 10_000_000,
        populationGrowthPerMinute: 12,
        populationTier: "SETTLEMENT",
        connectedTownCount: 0,
        connectedTownBonus: 0,
        hasMintworks: false,
        mintworksActive: false,
        hasGranary: false,
        granaryActive: false,
      }
    };

    const action = menuActionsForSingleTile(state, tile, baseDeps as never).find((entry) => entry.id === "grow_settlement_to_town");

    expect(action).toMatchObject({
      id: "grow_settlement_to_town",
      label: "Upgrade Settlement to Town",
      cost: "20 gold + 1 FOOD slot"
    });
    expect(action?.disabled).toBe(false);
  });

  it("shows a city growth action once a town is ready", () => {
    const state = createInitialState();
    state.me = "me";
    state.gold = 40;
    state.resourceSlots.supply.FOOD = 1;
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
        hasMintworks: false,
        mintworksActive: false,
        hasGranary: false,
        granaryActive: false,
        nextPopulationTierUpgrade: {
          targetTier: "CITY",
          requiredPopulation: 100_000,
          goldCost: 40,
          available: true
        }
      }
    };

    const action = menuActionsForSingleTile(state, tile, baseDeps as never).find((entry) => entry.id === "grow_town_to_city");

    expect(action).toMatchObject({
      id: "grow_town_to_city",
      label: "Upgrade Town to City",
      cost: "40 gold + 1 FOOD slot",
      detail: "Unlocks city-tier income and manpower."
    });
    expect(action?.disabled).toBe(false);
  });

  it("keeps the growth action disabled when gold is short", () => {
    const state = createInitialState();
    state.me = "me";
    state.gold = 10;
    state.resourceSlots.supply.FOOD = 1;
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
        hasMintworks: false,
        mintworksActive: false,
        hasGranary: false,
        granaryActive: false,
        nextPopulationTierUpgrade: {
          targetTier: "CITY",
          requiredPopulation: 100_000,
          goldCost: 40,
          available: true
        }
      }
    };

    const action = menuActionsForSingleTile(state, tile, baseDeps as never).find((entry) => entry.id === "grow_town_to_city");

    expect(action).toMatchObject({
      id: "grow_town_to_city",
      disabled: true,
      disabledReason: "Need 40 gold",
      cost: "40 gold + 1 FOOD slot"
    });
  });

  it("keeps the growth action disabled when there is no free FOOD slot", () => {
    const state = createInitialState();
    state.me = "me";
    state.gold = 40;
    state.resourceSlots.supply.FOOD = 0;
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
        hasMintworks: false,
        mintworksActive: false,
        hasGranary: false,
        granaryActive: false,
        nextPopulationTierUpgrade: {
          targetTier: "CITY",
          requiredPopulation: 100_000,
          goldCost: 40,
          available: true
        }
      }
    };

    const action = menuActionsForSingleTile(state, tile, baseDeps as never).find((entry) => entry.id === "grow_town_to_city");

    expect(action).toMatchObject({
      id: "grow_town_to_city",
      disabled: true,
      disabledReason: "Need a free FOOD slot",
      cost: "40 gold + 1 FOOD slot"
    });
  });

  it("shows a monumental city growth action for great cities", () => {
    const state = createInitialState();
    state.me = "me";
    state.gold = 160;
    state.resourceSlots.supply.FOOD = 1;
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
        hasMintworks: false,
        mintworksActive: false,
        hasGranary: false,
        granaryActive: false,
        nextPopulationTierUpgrade: {
          targetTier: "METROPOLIS",
          requiredPopulation: 5_000_000,
          goldCost: 160,
          available: true
        }
      }
    };

    const action = menuActionsForSingleTile(state, tile, baseDeps as never).find((entry) => entry.id === "grow_great_city_to_monumental_city");

    expect(action).toMatchObject({
      id: "grow_great_city_to_monumental_city",
      label: "Upgrade Great City to Metropolis",
      cost: "160 gold + 1 FOOD slot",
      detail: "Unlocks metropolis-tier income and manpower."
    });
    expect(action?.disabled).toBe(false);
  });

});
