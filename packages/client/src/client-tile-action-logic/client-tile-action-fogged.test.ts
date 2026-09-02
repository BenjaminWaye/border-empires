/**
 * Regression test for fogged/unexplored tile actions.
 *
 * A fogged (previously-explored, currently out-of-vision) tile used to
 * return zero actions unconditionally -- menuActionsForSingleTile short-
 * circuited on `if (tile.fogged) return [];` before this fix, so clicking
 * one only ever showed an empty Actions tab, even for perfectly claimable
 * neutral LAND. It now offers "Expand To" (expandToAction,
 * client-tile-action-neutral.ts) for a fogged neutral LAND tile, the same
 * action a live neutral tile gets -- everything else (build/attack/settle)
 * still needs live data it doesn't have and stays hidden.
 */
import { describe, expect, it } from "vitest";

import { createInitialState } from "../client-state/client-state.js";
import { menuActionsForSingleTile } from "./client-tile-action-logic.js";
import { expandToAction } from "./client-tile-action-neutral.js";
import { tileMenuHeaderStatusForTile } from "../client-tile-menu-status/client-tile-menu-status.js";
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

const stateWithGold = (): ReturnType<typeof createInitialState> => {
  const state = createInitialState();
  state.me = "me";
  state.gold = 10_000;
  state.manpower = 10_000;
  return state;
};

// TOWN_REACH_RADIUS = 3, so an owned town at (0,0) covers a fogged target at (1,1).
const stateWithTownAndGold = (): ReturnType<typeof createInitialState> => {
  const state = stateWithGold();
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

describe("fogged tile actions", () => {
  it("offers Expand To (settle_land) for a fogged tile the client has real cached data for", () => {
    const state = stateWithTownAndGold();
    const target: Tile = { x: 1, y: 1, terrain: "LAND", fogged: true };
    state.tiles.set(keyFor(1, 1), target);

    const actions = menuActionsForSingleTile(state, target, baseDeps as never);

    expect(findAction(actions, "settle_land")).toBeDefined();
    expect(findAction(actions, "settle_land")?.label).toBe("Expand To");
  });

  // Regression: settle_land's click handler (client-action-flow.ts) reads
  // its target via state.tiles.get(selectedKey) -- for a fogged tile with
  // NO locally-cached data (e.g. fogged before the current session started;
  // see the click-does-nothing fix this test module sits alongside),
  // "settle_land" would silently no-op. expand_here instead dispatches
  // through handleWaypointAction, which works from coordinates alone.
  it("offers Expand To (expand_here, not settle_land) for a fogged tile with no locally-cached data", () => {
    const state = stateWithTownAndGold();
    const target: Tile = { x: 1, y: 1, terrain: "LAND", fogged: true };
    expect(state.tiles.has(keyFor(1, 1))).toBe(false);

    const actions = menuActionsForSingleTile(state, target, baseDeps as never);

    expect(findAction(actions, "settle_land")).toBeUndefined();
    expect(findAction(actions, "expand_here")).toBeDefined();
    expect(findAction(actions, "expand_here")?.label).toBe("Expand To");
  });

  it("still offers nothing on a fogged SEA tile, a fogged tile with a known owner, or a fogged tile with no path from owned territory", () => {
    const state = stateWithGold();

    expect(menuActionsForSingleTile(state, { x: 1, y: 1, terrain: "SEA", fogged: true }, baseDeps as never)).toEqual([]);
    expect(menuActionsForSingleTile(state, { x: 1, y: 1, terrain: "LAND", ownerId: "enemy", fogged: true }, baseDeps as never)).toEqual([]);

    const unreachableDeps = { ...baseDeps, pickOriginForTarget: () => undefined };
    expect(menuActionsForSingleTile(state, { x: 1, y: 1, terrain: "LAND", fogged: true }, unreachableDeps as never)).toEqual([]);
  });

  it("shows a Fogged header status instead of a live-looking decay countdown built from stale data", () => {
    const status = tileMenuHeaderStatusForTile({
      x: 1,
      y: 1,
      terrain: "LAND",
      fogged: true,
      ownershipState: "FRONTIER",
      frontierDecayAt: Date.now() + 500,
      frontierDecayKind: "OUT_OF_REACH"
    } as Tile);
    expect(status?.text).toMatch(/fogged/i);
  });

  it("declines Expand To when this exact tile is already the target of a queued waypoint, instead of letting a second click stack a duplicate", () => {
    const state = stateWithGold();
    const target: Tile = { x: 5, y: 5, terrain: "LAND", fogged: true };
    state.waypoint.push({
      target: { x: 5, y: 5 },
      plan: { reachable: true, steps: [], totalGold: 0, totalManpower: 0, totalDurationMs: 0, expandCount: 1, attackCount: 0 },
      planId: "plan-1",
      plannedAt: Date.now()
    } as never);

    expect(expandToAction(state, target, { keyFor, pickOriginForTarget: () => ({ x: 0, y: 0, terrain: "LAND" }) })).toBeUndefined();
  });
});
