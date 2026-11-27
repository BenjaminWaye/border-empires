/**
 * Garrison visibility on your own FRONTIER tiles. Before a garrisoned town +
 * food tile exist, plain tiles still get Garrison (it is how you defend them
 * and what desert/tundra House Charges ask for), but only payoff tiles are
 * recommended.
 */
import { NEW_PLAYER_AUTO_SETTLE_PREFS } from "@border-empires/shared";
import { describe, expect, it } from "vitest";

import { createInitialState } from "../client-state/client-state.js";
import { menuActionsForSingleTile } from "./client-tile-action-logic.js";
import type { Tile, TileActionDef } from "../client-types.js";
import { loadedAutoSettleState } from "../client-auto-settle-prompt/client-auto-settle-prefs.js";

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

describe("Garrison visibility on your own frontier", () => {
  // Regression (Playtest Run 5, Priya): a plain sand frontier tile inside reach showed no Garrison at all
  // before a garrisoned town + food tile existed, while its "Your frontier" help said to garrison it and a
  // House Charge asked her to garrison 75% of a desert. She fell back to Build > Fortify > Palisade per tile.
  it("shows Garrison and Garrison Many on a plain owned FRONTIER tile before the economy is established", () => {
    const state = createInitialState();
    state.me = "me";
    state.gold = 10_000;
    state.manpower = 10_000;
    state.tiles.set(keyFor(0, 0), settledTownTile);
    state.tiles.set(keyFor(1, 0), frontierTile);

    const actions = menuActionsForSingleTile(state, frontierTile, baseDeps as never);
    const settle = findAction(actions, "settle_land");
    expect(settle).toBeDefined();
    expect(settle?.disabled).toBeFalsy();
    expect(settle?.recommended).toBeUndefined();
    expect(findAction(actions, "settle_many")?.disabled).toBe(false);
  });

  it("shows Garrison disabled with the reach reason on a plain frontier tile out of reach before the economy exists", () => {
    const state = createInitialState();
    state.me = "me";
    state.gold = 10_000;
    state.manpower = 10_000;
    state.tiles.set(keyFor(0, 0), settledTownTile);
    const far = { x: 50, y: 50, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER" } as Tile;
    state.tiles.set(keyFor(50, 50), far);

    const settle = findAction(menuActionsForSingleTile(state, far, baseDeps as never), "settle_land");
    expect(settle?.disabled).toBe(true);
    expect(settle?.disabledReason).toMatch(/^Outside your reach/);
  });

  it("shows settle_land with its gain/upkeep line and auto-settle checkbox on a resource tile even before the economy exists", () => {
    const state = createInitialState();
    state.me = "me";
    state.gold = 10_000;
    state.manpower = 10_000;
    state.autoSettle = loadedAutoSettleState({ ...NEW_PLAYER_AUTO_SETTLE_PREFS });
    const farm = { x: 1, y: 0, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER", resource: "FARM" } as Tile;
    state.tiles.set(keyFor(1, 0), farm);

    const actions = menuActionsForSingleTile(state, farm, baseDeps as never);
    const settle = findAction(actions, "settle_land");
    expect(settle?.detail).toContain("Gain: +1 food slot. Upkeep: none.");
    expect(settle?.autoSettleOption).toMatchObject({ category: "FARM", checked: false });
    expect(settle?.recommended).toBe(true);
  });

  it("shows and recommends Garrison on a grown town's support tile before the economy is established", () => {
    // Regression: support tiles counted as plain tiles, so without a garrisoned
    // food tile they had no Garrison option at all.
    const state = createInitialState();
    state.me = "me";
    state.gold = 10_000;
    state.manpower = 10_000;
    state.tiles.set(keyFor(0, 0), { ...settledTownTile, town: { name: "Capital", type: "FARMING", populationTier: "TOWN" } } as Tile);
    state.tiles.set(keyFor(1, 0), frontierTile);

    const settle = findAction(menuActionsForSingleTile(state, frontierTile, baseDeps as never), "settle_land");
    expect(settle).toBeDefined();
    expect(settle?.recommended).toBe(true);
  });

  it("also recommends it on a natural wonder, but not on a plain tile", () => {
    const state = createInitialState();
    state.me = "me";
    state.gold = 10_000;
    state.manpower = 10_000;
    state.tiles.set(keyFor(0, 0), settledTownTile);
    state.tiles.set(keyFor(2, 0), { x: 2, y: 0, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", resource: "FARM" } as Tile);
    const wonder = { x: 1, y: 0, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER", naturalWonder: { type: "RAINBOW_RIDGE" } } as unknown as Tile;
    const wonderSettle = findAction(menuActionsForSingleTile(state, wonder, baseDeps as never), "settle_land");
    expect(wonderSettle?.recommended).toBe(true);
    expect(wonderSettle?.autoSettleOption).toBeUndefined();
    expect(findAction(menuActionsForSingleTile(state, frontierTile, baseDeps as never), "settle_land")?.recommended).toBeUndefined();
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
