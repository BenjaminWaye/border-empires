/**
 * Regression test for the "Build Relay Beacon" (expand+settle+build,
 * build_relay_beacon_frontier) button's visibility gate.
 *
 * It used to be gated on isAdjacentToUnexplored (does this tile border
 * unexplored fog) -- a condition that predates the fixed-borders-via-reach
 * feature and has nothing to do with reach or territory adjacency. That
 * only incidentally correlated with the border/reach edge (fog usually
 * starts right where a player has stopped expanding), which made the
 * button appear to work near the border/outside reach and never appear on
 * ordinary already-explored ground well inside reach -- exactly the
 * reported bug. It's now gated on real buildability: an adjacent/dock/
 * bridge origin exists AND the target is inside the fixed-border reach
 * EXPAND will actually require server-side.
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
  // Always reports a valid adjacent origin -- isolates these assertions to
  // the reach gate specifically, not adjacency (already covered elsewhere).
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

const stateWithTown = (townX: number, townY: number): ReturnType<typeof createInitialState> => {
  const state = createInitialState();
  state.me = "me";
  state.gold = 10_000;
  state.manpower = 10_000;
  state.resourceSlots = { supply: { FOOD: 10, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 }, demand: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 } };
  state.tiles.set(keyFor(townX, townY), {
    x: townX,
    y: townY,
    terrain: "LAND",
    ownerId: "me",
    ownershipState: "SETTLED",
    town: { name: "Capital", type: "FARMING", populationTier: "SETTLEMENT" }
  } as Tile);
  return state;
};

describe("build_relay_beacon_frontier — gated on reach, not fog exploration", () => {
  it("shows the button on an ordinary already-explored tile well inside reach (not fog-adjacent)", () => {
    const state = stateWithTown(0, 0); // TOWN_REACH_RADIUS = 3 covers (2,2)
    const target: Tile = { x: 2, y: 2, terrain: "LAND" } as Tile;
    state.tiles.set(keyFor(2, 2), target);
    // Mark it (and its neighbours) already discovered -- the OLD fog-based
    // gate would have hidden the button here even though it's a perfectly
    // buildable in-reach tile, which is exactly the reported bug.
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) state.discoveredTiles.add(keyFor(2 + dx, 2 + dy));
    }

    const actions = menuActionsForSingleTile(state, target, baseDeps as never);
    const action = findAction(actions, "build_relay_beacon_frontier" as TileActionDef["id"]);
    expect(action).toBeDefined();
  });

  it("hides the button on a tile outside reach, even if it happens to border unexplored fog", () => {
    const state = stateWithTown(0, 0); // TOWN_REACH_RADIUS = 3 -- (50,50) is nowhere near it
    const target: Tile = { x: 50, y: 50, terrain: "LAND" } as Tile;
    state.tiles.set(keyFor(50, 50), target);
    // Deliberately leave neighbours undiscovered -- the OLD fog-based gate
    // would have shown the button here purely because of the fog, even
    // though the tile is nowhere near the player's actual reach.

    const actions = menuActionsForSingleTile(state, target, baseDeps as never);
    const action = findAction(actions, "build_relay_beacon_frontier" as TileActionDef["id"]);
    expect(action).toBeUndefined();
  });
});
