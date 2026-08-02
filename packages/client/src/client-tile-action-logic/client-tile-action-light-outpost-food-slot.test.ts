/**
 * Regression test for the Light Outpost FOOD-slot gate.
 *
 * The server waives the FOOD slot cost for a player's first
 * LIGHT_OUTPOST_FREE_FOOD_SLOT_COUNT Light Outposts (slot-waivers.ts). The
 * client's generic hasFreeResourceSlots/missingResourceSlotReason gate
 * doesn't know about that waiver — it only sees the aggregate FOOD
 * supply/demand — so a Light Outpost build needs its own count-based check
 * (ownedLightOutpostCount vs LIGHT_OUTPOST_FREE_FOOD_SLOT_COUNT) ahead of the
 * generic FOOD-slot check, which should only actually bite from the 6th
 * outpost onward.
 *
 * Covers both "Build Light Outpost" buttons: the direct build on an owned
 * SETTLED tile (build_light_outpost) and the frontier expand+settle+build
 * button on unclaimed land (build_light_outpost_frontier).
 */
import { describe, expect, it } from "vitest";
import { LIGHT_OUTPOST_FREE_FOOD_SLOT_COUNT } from "@border-empires/shared";

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
  // No FOOD supply at all — isolates the assertions to the Light Outpost
  // count-based waiver rather than a coincidentally-sufficient FOOD slot.
  state.resourceSlots = { supply: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0 }, demand: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0 } };
  return state;
};

const addOwnedLightOutposts = (state: ReturnType<typeof createInitialState>, count: number): void => {
  for (let i = 0; i < count; i++) {
    const x = 100 + i;
    const y = 100;
    state.tiles.set(keyFor(x, y), {
      x,
      y,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      economicStructure: { ownerId: "me", type: "LIGHT_OUTPOST", status: "active" }
    } as Tile);
  }
};

describe("Light Outpost FOOD-slot gate — build_light_outpost_frontier (unclaimed, expand+settle+build)", () => {
  it(`stays enabled with zero FOOD supply while the player owns fewer than ${LIGHT_OUTPOST_FREE_FOOD_SLOT_COUNT} outposts`, () => {
    const state = richState();
    addOwnedLightOutposts(state, LIGHT_OUTPOST_FREE_FOOD_SLOT_COUNT - 1);
    const unexplored: Tile = { x: 3, y: 3, terrain: "LAND" } as Tile;
    state.tiles.set(keyFor(3, 3), unexplored);

    const actions = menuActionsForSingleTile(state, unexplored, baseDeps as never);
    const action = findAction(actions, "build_light_outpost_frontier" as TileActionDef["id"]);
    expect(action).toBeDefined();
    expect(action?.disabled).not.toBe(true);
  });

  it(`disables with "Need a free FOOD slot" once the player already owns ${LIGHT_OUTPOST_FREE_FOOD_SLOT_COUNT} outposts and has no free FOOD slot`, () => {
    const state = richState();
    addOwnedLightOutposts(state, LIGHT_OUTPOST_FREE_FOOD_SLOT_COUNT);
    const unexplored: Tile = { x: 3, y: 3, terrain: "LAND" } as Tile;
    state.tiles.set(keyFor(3, 3), unexplored);

    const actions = menuActionsForSingleTile(state, unexplored, baseDeps as never);
    const action = findAction(actions, "build_light_outpost_frontier" as TileActionDef["id"]);
    expect(action).toBeDefined();
    expect(action?.disabled).toBe(true);
    expect(action?.disabledReason).toBe("Need a free FOOD slot");
  });

  it(`re-enables once a free FOOD slot is available for the ${LIGHT_OUTPOST_FREE_FOOD_SLOT_COUNT + 1}th outpost`, () => {
    const state = richState();
    addOwnedLightOutposts(state, LIGHT_OUTPOST_FREE_FOOD_SLOT_COUNT);
    state.resourceSlots.supply.FOOD = 1;
    const unexplored: Tile = { x: 3, y: 3, terrain: "LAND" } as Tile;
    state.tiles.set(keyFor(3, 3), unexplored);

    const actions = menuActionsForSingleTile(state, unexplored, baseDeps as never);
    const action = findAction(actions, "build_light_outpost_frontier" as TileActionDef["id"]);
    expect(action).toBeDefined();
    expect(action?.disabled).not.toBe(true);
  });
});

describe("Light Outpost FOOD-slot gate — build_light_outpost (direct build on an owned SETTLED tile)", () => {
  it(`stays enabled with zero FOOD supply while the player owns fewer than ${LIGHT_OUTPOST_FREE_FOOD_SLOT_COUNT} outposts`, () => {
    const state = richState();
    addOwnedLightOutposts(state, LIGHT_OUTPOST_FREE_FOOD_SLOT_COUNT - 1);
    const settled: Tile = { x: 3, y: 3, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" } as Tile;
    state.tiles.set(keyFor(3, 3), settled);

    const actions = menuActionsForSingleTile(state, settled, baseDeps as never);
    const action = findAction(actions, "build_light_outpost" as TileActionDef["id"]);
    expect(action).toBeDefined();
    expect(action?.disabled).not.toBe(true);
  });

  it(`disables with "Need a free FOOD slot" once the player already owns ${LIGHT_OUTPOST_FREE_FOOD_SLOT_COUNT} outposts and has no free FOOD slot`, () => {
    const state = richState();
    addOwnedLightOutposts(state, LIGHT_OUTPOST_FREE_FOOD_SLOT_COUNT);
    const settled: Tile = { x: 3, y: 3, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" } as Tile;
    state.tiles.set(keyFor(3, 3), settled);

    const actions = menuActionsForSingleTile(state, settled, baseDeps as never);
    const action = findAction(actions, "build_light_outpost" as TileActionDef["id"]);
    expect(action).toBeDefined();
    expect(action?.disabled).toBe(true);
    expect(action?.disabledReason).toBe("Need a free FOOD slot");
  });
});
