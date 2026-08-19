/**
 * Regression test for the client-side EXPAND/SETTLE manpower-gate fix.
 *
 * Bug: the "Settle Land" action (both the neutral-tile EXPAND variant and the
 * FRONTIER-tile SETTLE variant) only ever checked gold affordability
 * (state.gold >= FRONTIER_CLAIM_COST / SETTLE_COST) — never manpower. Once
 * EXPAND/SETTLE started costing EXPAND_MANPOWER_COST/SETTLE_MANPOWER_COST
 * manpower (§4.1-§4.2 of docs/manpower-economy-rewrite-plan.md), this meant
 * the client could show these actions as available (and let a player click
 * them) when the server would actually reject the command with
 * INSUFFICIENT_MANPOWER.
 *
 * Fix: both actions now also check state.manpower against the respective
 * manpower cost, matching the pattern already used for structure builds
 * (WOODEN_FORT, FORT, RELAY_BEACON, SIEGE_OUTPOST).
 */
import { describe, expect, it } from "vitest";
import { EXPAND_MANPOWER_COST, SETTLE_MANPOWER_COST } from "@border-empires/shared";

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
  // Non-null so the "reachable" branch is exercised — these tests are about
  // the manpower/gold gate, not reachability.
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
  // A settled town within TOWN_REACH_RADIUS (3) of the (3,3) target used
  // below -- settle_land is now hidden entirely outside reach, so these
  // gold/manpower-gate assertions need a real reach anchor to even see the
  // action row at all.
  state.tiles.set(keyFor(0, 0), {
    x: 0,
    y: 0,
    terrain: "LAND",
    ownerId: "me",
    ownershipState: "SETTLED",
    town: { name: "Capital", type: "FARMING", populationTier: "SETTLEMENT" }
  } as Tile);
  return state;
};

describe("EXPAND/SETTLE client manpower gate", () => {
  it("disables Settle Land (EXPAND) on unclaimed neutral land when manpower is below EXPAND_MANPOWER_COST, even with plenty of gold", () => {
    const state = richState();
    state.manpower = EXPAND_MANPOWER_COST - 1;
    const neutral: Tile = { x: 3, y: 3, terrain: "LAND" } as Tile;
    state.tiles.set(keyFor(3, 3), neutral);

    const actions = menuActionsForSingleTile(state, neutral, baseDeps as never);
    const settleLand = findAction(actions, "settle_land");
    expect(settleLand).toBeDefined();
    expect(settleLand?.disabled).toBe(true);
    expect(settleLand?.disabledReason).toBe(`Need ${EXPAND_MANPOWER_COST} manpower`);
  });

  it("enables Settle Land (EXPAND) on unclaimed neutral land once manpower covers EXPAND_MANPOWER_COST", () => {
    const state = richState();
    state.manpower = EXPAND_MANPOWER_COST;
    const neutral: Tile = { x: 3, y: 3, terrain: "LAND" } as Tile;
    state.tiles.set(keyFor(3, 3), neutral);

    const actions = menuActionsForSingleTile(state, neutral, baseDeps as never);
    const settleLand = findAction(actions, "settle_land");
    expect(settleLand).toBeDefined();
    expect(settleLand?.disabled).not.toBe(true);
  });

  it("disables Settle Land (SETTLE) on an owned FRONTIER tile when manpower is below SETTLE_MANPOWER_COST, even with plenty of gold", () => {
    const state = richState();
    state.manpower = SETTLE_MANPOWER_COST - 1;
    const frontier: Tile = { x: 3, y: 3, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER" } as Tile;
    state.tiles.set(keyFor(3, 3), frontier);

    const actions = menuActionsForSingleTile(state, frontier, baseDeps as never);
    const settleLand = findAction(actions, "settle_land");
    expect(settleLand).toBeDefined();
    expect(settleLand?.disabled).toBe(true);
    expect(settleLand?.disabledReason).toBe(`Need ${SETTLE_MANPOWER_COST} manpower`);
  });

  it("enables Settle Land (SETTLE) on an owned FRONTIER tile once manpower covers SETTLE_MANPOWER_COST", () => {
    const state = richState();
    state.manpower = SETTLE_MANPOWER_COST;
    const frontier: Tile = { x: 3, y: 3, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER" } as Tile;
    state.tiles.set(keyFor(3, 3), frontier);

    const actions = menuActionsForSingleTile(state, frontier, baseDeps as never);
    const settleLand = findAction(actions, "settle_land");
    expect(settleLand).toBeDefined();
    expect(settleLand?.disabled).not.toBe(true);
  });
});
