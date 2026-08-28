/**
 * Regression test for hiding manual Settle Land / Settle Connected until the
 * player has an established economy.
 *
 * Manual settling has nothing to offer in the opening minutes -- it's really
 * only useful once a town and a food tile are running, for cheap defense,
 * connecting towns, or consolidating territory. This asserts the actions are
 * actually absent from the menu without a settled town + settled food tile
 * (farm or fish), and actually present once both exist -- so a future change
 * that drops or inverts the `hasEstablishedTownAndFoodTile` guard is caught
 * even though the other settle-related test fixtures all supply a qualifying
 * town + food tile up front.
 */
import { describe, expect, it } from "vitest";

import { createInitialState } from "../client-state/client-state.js";
import { hasEstablishedTownAndFoodTile } from "./client-tile-action-settle-visibility.js";
import { menuActionsForSingleTile } from "./client-tile-action-logic.js";
import type { Tile, TileActionDef } from "../client-types.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;

const baseDeps = {
  keyFor,
  parseKey: (k: string) => {
    const [x, y] = k.split(",").map(Number);
    return { x, y };
  },
  wrapX: (x: number) => x,
  wrapY: (y: number) => y,
  terrainAt: () => "LAND" as const,
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
  pickOriginForTarget: () => ({ x: 0, y: 0 }),
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
  ownerSpawnShieldActive: () => false,
  connectedOwnedFrontierKeysFor: () => []
} as const;

const findAction = (actions: TileActionDef[], id: TileActionDef["id"]): TileActionDef | undefined =>
  actions.find((action) => action.id === id);

const settledTownTile: Tile = {
  x: 0,
  y: 0,
  terrain: "LAND",
  ownerId: "me",
  ownershipState: "SETTLED",
  town: { name: "Capital", type: "FARMING", populationTier: "SETTLEMENT" }
} as Tile;

const frontierTile: Tile = { x: 1, y: 0, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER" } as Tile;

describe("hasEstablishedTownAndFoodTile", () => {
  it("is false with only a settled town and no settled food tile", () => {
    const state = createInitialState();
    state.me = "me";
    state.tiles.set(keyFor(0, 0), settledTownTile);
    expect(hasEstablishedTownAndFoodTile(state)).toBe(false);
  });

  it("is false with a settled food tile but no settled town", () => {
    const state = createInitialState();
    state.me = "me";
    state.tiles.set(keyFor(2, 0), { x: 2, y: 0, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", resource: "FARM" } as Tile);
    expect(hasEstablishedTownAndFoodTile(state)).toBe(false);
  });

  it("is true once both a settled town and a settled FARM tile are owned", () => {
    const state = createInitialState();
    state.me = "me";
    state.tiles.set(keyFor(0, 0), settledTownTile);
    state.tiles.set(keyFor(2, 0), { x: 2, y: 0, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", resource: "FARM" } as Tile);
    expect(hasEstablishedTownAndFoodTile(state)).toBe(true);
  });

  it("is true once both a settled town and a settled FISH tile are owned", () => {
    const state = createInitialState();
    state.me = "me";
    state.tiles.set(keyFor(0, 0), settledTownTile);
    state.tiles.set(keyFor(2, 0), { x: 2, y: 0, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", resource: "FISH" } as Tile);
    expect(hasEstablishedTownAndFoodTile(state)).toBe(true);
  });

  it("does not count an unsettled (FRONTIER) food tile", () => {
    const state = createInitialState();
    state.me = "me";
    state.tiles.set(keyFor(0, 0), settledTownTile);
    state.tiles.set(keyFor(2, 0), { x: 2, y: 0, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER", resource: "FARM" } as Tile);
    expect(hasEstablishedTownAndFoodTile(state)).toBe(false);
  });
});

describe("Settle Land / Settle Connected visibility gate", () => {
  it("hides settle_land on an owned FRONTIER tile before the economy is established", () => {
    const state = createInitialState();
    state.me = "me";
    state.gold = 10_000;
    state.manpower = 10_000;
    state.tiles.set(keyFor(0, 0), settledTownTile);
    state.tiles.set(keyFor(1, 0), frontierTile);

    const actions = menuActionsForSingleTile(state, frontierTile, baseDeps as never);
    expect(findAction(actions, "settle_land")).toBeUndefined();
    expect(findAction(actions, "settle_connected_frontier")).toBeUndefined();
  });

  it("shows settle_land at the bottom of the actions list once the economy is established", () => {
    const state = createInitialState();
    state.me = "me";
    state.gold = 10_000;
    state.manpower = 10_000;
    state.tiles.set(keyFor(0, 0), settledTownTile);
    state.tiles.set(keyFor(2, 0), { x: 2, y: 0, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", resource: "FARM" } as Tile);
    state.tiles.set(keyFor(1, 0), frontierTile);

    const actions = menuActionsForSingleTile(state, frontierTile, baseDeps as never);
    const settleIndex = actions.findIndex((a) => a.id === "settle_land");
    expect(settleIndex).toBeGreaterThanOrEqual(0);
    // Settle Land is pushed after every other build/muster/ability action for
    // the tile -- only a handful of always-on trailing actions (retort recast,
    // crystal core, create-mountain, abandon-territory) come after it.
    expect(actions.length - settleIndex).toBeLessThanOrEqual(4);
  });
});
