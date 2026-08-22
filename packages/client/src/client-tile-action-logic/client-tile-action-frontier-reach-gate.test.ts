/**
 * Fixed-border reach: EXPAND itself is no longer reach-gated server-side,
 * but SETTLE and outpost-family builds (siege outposts / relay beacon)
 * still are. A player-owned FRONTIER tile outside reach should show
 * settle_land / settle_connected_frontier / build_relay_beacon /
 * build_siege_camp as visible-but-disabled with "Outside your reach",
 * instead of hiding them.
 */
import { describe, expect, it } from "vitest";

import { createInitialState } from "../client-state/client-state.js";
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
  buildDetailTextForAction: () => "",
  developmentSlotSummary: () => ({ used: 0, limit: 3, available: 3, busy: 0 }),
  developmentSlotReason: () => "",
  structureGoldCost: () => 500,
  structureCostText: (type: string) => `${type} cost`,
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

const stateWithTownAndFrontierTile = (frontierX: number, frontierY: number): {
  state: ReturnType<typeof createInitialState>;
  target: Tile;
} => {
  const state = createInitialState();
  state.me = "me";
  state.gold = 10_000;
  state.manpower = 10_000;
  state.resourceSlots = { supply: { FOOD: 10, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 }, demand: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 } };
  state.tiles.set(keyFor(0, 0), {
    x: 0,
    y: 0,
    terrain: "LAND",
    ownerId: "me",
    ownershipState: "SETTLED",
    town: { name: "Capital", type: "FARMING", populationTier: "SETTLEMENT" }
  } as Tile);
  const target: Tile = { x: frontierX, y: frontierY, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER" } as Tile;
  state.tiles.set(keyFor(frontierX, frontierY), target);
  return { state, target };
};

describe("owned FRONTIER tile outside reach — disabled with reason, not hidden", () => {
  it("shows settle_land disabled with 'Outside your reach' instead of hiding it", () => {
    const { state, target } = stateWithTownAndFrontierTile(50, 50); // far outside TOWN_REACH_RADIUS = 3

    const actions = menuActionsForSingleTile(state, target, baseDeps as never);
    const settleLand = findAction(actions, "settle_land");
    expect(settleLand).toBeDefined();
    expect(settleLand?.disabled).toBe(true);
    expect(settleLand?.disabledReason).toBe("Outside your reach");
  });

  it("leaves settle_land enabled (by normal cost rules) on a FRONTIER tile inside reach", () => {
    const { state, target } = stateWithTownAndFrontierTile(2, 2); // inside TOWN_REACH_RADIUS = 3

    const actions = menuActionsForSingleTile(state, target, baseDeps as never);
    const settleLand = findAction(actions, "settle_land");
    expect(settleLand).toBeDefined();
    expect(settleLand?.disabled).toBeFalsy();
  });
});
