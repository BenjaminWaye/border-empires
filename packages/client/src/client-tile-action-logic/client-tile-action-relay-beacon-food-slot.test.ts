/**
 * Regression test for the Relay Beacon FOOD-slot gate.
 *
 * The server waives the FOOD slot cost for a player's first
 * RELAY_BEACON_FREE_FOOD_SLOT_COUNT Relay Beacons (slot-waivers.ts). The
 * client's generic hasFreeResourceSlots/missingResourceSlotReason gate
 * doesn't know about that waiver — it only sees the aggregate FOOD
 * supply/demand — so a Relay Beacon build needs its own count-based check
 * (ownedRelayBeaconCount vs RELAY_BEACON_FREE_FOOD_SLOT_COUNT) ahead of the
 * generic FOOD-slot check, which should only actually bite from the 6th
 * outpost onward.
 *
 * Covers both "Build Relay Beacon" buttons: the direct build on an owned
 * SETTLED tile (build_relay_beacon) and the frontier expand+settle+build
 * button on unclaimed land (build_relay_beacon_frontier).
 */
import { describe, expect, it } from "vitest";
import { RELAY_BEACON_FREE_FOOD_SLOT_COUNT } from "@border-empires/shared";

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

const richState = (): ReturnType<typeof createInitialState> => {
  const state = createInitialState();
  state.me = "me";
  state.gold = 10_000;
  state.manpower = 10_000;
  // No FOOD supply at all — isolates the assertions to the Relay Beacon
  // count-based waiver rather than a coincidentally-sufficient FOOD slot.
  state.resourceSlots = { supply: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 }, demand: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 } };
  // Reach anchor near the tests' (3,3) target tile: build_relay_beacon_frontier
  // now requires the target to be inside the player's fixed-border reach
  // (see client-tile-action-logic.ts), not just fog-adjacent -- this file's
  // owned relay beacons (addOwnedRelayBeacons) live far away at (100+i,100)
  // purely to drive the FOOD-slot count logic under test, so they can't
  // double as the reach anchor these assertions also need.
  state.tiles.set(keyFor(1, 1), {
    x: 1,
    y: 1,
    terrain: "LAND",
    ownerId: "me",
    ownershipState: "SETTLED",
    town: { name: "Capital", type: "FARMING", populationTier: "SETTLEMENT" }
  } as Tile);
  return state;
};

const addOwnedRelayBeacons = (state: ReturnType<typeof createInitialState>, count: number): void => {
  for (let i = 0; i < count; i++) {
    const x = 100 + i;
    const y = 100;
    state.tiles.set(keyFor(x, y), {
      x,
      y,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      economicStructure: { ownerId: "me", type: "RELAY_BEACON", status: "active" }
    } as Tile);
  }
};

describe("Relay Beacon FOOD-slot gate — build_relay_beacon_frontier (unclaimed, expand+settle+build)", () => {
  it(`stays enabled with zero FOOD supply while the player owns fewer than ${RELAY_BEACON_FREE_FOOD_SLOT_COUNT} outposts`, () => {
    const state = richState();
    addOwnedRelayBeacons(state, RELAY_BEACON_FREE_FOOD_SLOT_COUNT - 1);
    const unexplored: Tile = { x: 3, y: 3, terrain: "LAND" } as Tile;
    state.tiles.set(keyFor(3, 3), unexplored);

    const actions = menuActionsForSingleTile(state, unexplored, baseDeps as never);
    const action = findAction(actions, "build_relay_beacon_frontier" as TileActionDef["id"]);
    expect(action).toBeDefined();
    expect(action?.disabled).not.toBe(true);
  });

  it(`disables with "Need a free FOOD slot" once the player already owns ${RELAY_BEACON_FREE_FOOD_SLOT_COUNT} outposts and has no free FOOD slot`, () => {
    const state = richState();
    addOwnedRelayBeacons(state, RELAY_BEACON_FREE_FOOD_SLOT_COUNT);
    const unexplored: Tile = { x: 3, y: 3, terrain: "LAND" } as Tile;
    state.tiles.set(keyFor(3, 3), unexplored);

    const actions = menuActionsForSingleTile(state, unexplored, baseDeps as never);
    const action = findAction(actions, "build_relay_beacon_frontier" as TileActionDef["id"]);
    expect(action).toBeDefined();
    expect(action?.disabled).toBe(true);
    expect(action?.disabledReason).toBe("Need a free FOOD slot");
  });

  it(`re-enables once a free FOOD slot is available for the ${RELAY_BEACON_FREE_FOOD_SLOT_COUNT + 1}th outpost`, () => {
    const state = richState();
    addOwnedRelayBeacons(state, RELAY_BEACON_FREE_FOOD_SLOT_COUNT);
    state.resourceSlots.supply.FOOD = 1;
    const unexplored: Tile = { x: 3, y: 3, terrain: "LAND" } as Tile;
    state.tiles.set(keyFor(3, 3), unexplored);

    const actions = menuActionsForSingleTile(state, unexplored, baseDeps as never);
    const action = findAction(actions, "build_relay_beacon_frontier" as TileActionDef["id"]);
    expect(action).toBeDefined();
    expect(action?.disabled).not.toBe(true);
  });
});

describe("Relay Beacon FOOD-slot gate — build_relay_beacon (direct build on an owned SETTLED tile)", () => {
  it(`stays enabled with zero FOOD supply while the player owns fewer than ${RELAY_BEACON_FREE_FOOD_SLOT_COUNT} outposts`, () => {
    const state = richState();
    addOwnedRelayBeacons(state, RELAY_BEACON_FREE_FOOD_SLOT_COUNT - 1);
    const settled: Tile = { x: 3, y: 3, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" } as Tile;
    state.tiles.set(keyFor(3, 3), settled);

    const actions = menuActionsForSingleTile(state, settled, baseDeps as never);
    const action = findAction(actions, "build_relay_beacon" as TileActionDef["id"]);
    expect(action).toBeDefined();
    expect(action?.disabled).not.toBe(true);
  });

  it(`disables with "Need a free FOOD slot" once the player already owns ${RELAY_BEACON_FREE_FOOD_SLOT_COUNT} outposts and has no free FOOD slot`, () => {
    const state = richState();
    addOwnedRelayBeacons(state, RELAY_BEACON_FREE_FOOD_SLOT_COUNT);
    const settled: Tile = { x: 3, y: 3, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" } as Tile;
    state.tiles.set(keyFor(3, 3), settled);

    const actions = menuActionsForSingleTile(state, settled, baseDeps as never);
    const action = findAction(actions, "build_relay_beacon" as TileActionDef["id"]);
    expect(action).toBeDefined();
    expect(action?.disabled).toBe(true);
    expect(action?.disabledReason).toBe("Need a free FOOD slot");
  });
});

describe("Relay Beacon FOOD-slot gate — build_relay_beacon on an owned FRONTIER tile (settle-then-build)", () => {
  it(`appears on a FRONTIER owned tile with fewer than ${RELAY_BEACON_FREE_FOOD_SLOT_COUNT} outposts`, () => {
    const state = richState();
    addOwnedRelayBeacons(state, RELAY_BEACON_FREE_FOOD_SLOT_COUNT - 1);
    const frontier: Tile = { x: 3, y: 3, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER", resource: "FARM" } as Tile;
    state.tiles.set(keyFor(3, 3), frontier);

    const actions = menuActionsForSingleTile(state, frontier, baseDeps as never);
    const action = findAction(actions, "build_relay_beacon" as TileActionDef["id"]);
    expect(action).toBeDefined();
    expect(action?.disabled).not.toBe(true);
    expect(action?.cost).toContain("settle + build");
  });

  it(`still bites with "Need a free FOOD slot" past ${RELAY_BEACON_FREE_FOOD_SLOT_COUNT} outposts`, () => {
    const state = richState();
    addOwnedRelayBeacons(state, RELAY_BEACON_FREE_FOOD_SLOT_COUNT);
    const frontier: Tile = { x: 3, y: 3, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER", resource: "FARM" } as Tile;
    state.tiles.set(keyFor(3, 3), frontier);

    const actions = menuActionsForSingleTile(state, frontier, baseDeps as never);
    const action = findAction(actions, "build_relay_beacon" as TileActionDef["id"]);
    expect(action).toBeDefined();
    expect(action?.disabled).toBe(true);
    expect(action?.disabledReason).toBe("Need a free FOOD slot");
  });
});
