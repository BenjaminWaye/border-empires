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
  // Settle Land/Settle Connected are hidden until the player has an established
  // economy (a settled town + a settled grain tile) -- give this fixture a
  // settled FARM tile too, so these reach-gate assertions can still see the row.
  state.tiles.set(keyFor(0, 1), {
    x: 0,
    y: 1,
    terrain: "LAND",
    ownerId: "me",
    ownershipState: "SETTLED",
    resource: "FARM"
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

// The siege ladder's own OUT_OF_REACH gate is weaker than settle_land's: it
// only blocks a FRONTIER tile no one's reach covers at all
// (tile.reachOwnerId undefined), not merely "outside MY OWN reach" -- see
// runtime-structure-command-handlers.ts's OUT_OF_REACH gate and
// tile.reachOwnerId's doc comment. A siege outpost is meant to be pushed
// into contested/enemy territory, so a tile sitting in another player's
// reach is fair game.
describe("build_siege_camp's reach gate — weaker than settle_land's", () => {
  const siegeReadyDeps = { ...baseDeps, structureCostText: () => "" };

  it("shows build_siege_camp disabled with 'Outside your reach' when NO ONE's reach covers the tile", () => {
    const { state, target } = stateWithTownAndFrontierTile(50, 50); // far outside TOWN_REACH_RADIUS = 3
    state.techIds = ["leatherworking"];
    state.resourceSlots!.supply.UMBRITE = 1;
    // No reachOwnerId at all -- true leapfrogging into ground no one's border covers.

    const actions = menuActionsForSingleTile(state, target, siegeReadyDeps as never);
    const siegeCamp = findAction(actions, "build_siege_camp");
    expect(siegeCamp).toBeDefined();
    expect(siegeCamp?.disabled).toBe(true);
    expect(siegeCamp?.disabledReason).toBe("Outside your reach");
  });

  it("leaves build_siege_camp enabled on a FRONTIER tile sitting inside ANOTHER player's reach", () => {
    const { state, target } = stateWithTownAndFrontierTile(50, 50); // far outside MY OWN reach
    state.techIds = ["leatherworking"];
    state.resourceSlots!.supply.UMBRITE = 1;
    target.reachOwnerId = "rival-player"; // a rival's disk currently covers this tile

    const actions = menuActionsForSingleTile(state, target, siegeReadyDeps as never);
    const siegeCamp = findAction(actions, "build_siege_camp");
    expect(siegeCamp).toBeDefined();
    expect(siegeCamp?.disabled).toBeFalsy();
  });

  it("has no ' • settles this tile first' detail suffix on a FRONTIER tile -- the siege ladder never settles first", () => {
    const { state, target } = stateWithTownAndFrontierTile(2, 2); // inside my own reach
    state.techIds = ["leatherworking"];
    state.resourceSlots!.supply.UMBRITE = 1;

    const actions = menuActionsForSingleTile(state, target, siegeReadyDeps as never);
    const siegeCamp = findAction(actions, "build_siege_camp");
    expect(siegeCamp).toBeDefined();
    expect(siegeCamp?.detail).not.toContain("settles this tile first");
  });
});
