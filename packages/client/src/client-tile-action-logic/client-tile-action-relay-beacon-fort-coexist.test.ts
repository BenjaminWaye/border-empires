/**
 * Regression test: the "Build Relay Beacon" action must still show on a
 * tile that already has a Fort (e.g. a dock with a Fort on it).
 *
 * The sim (runtime-structure-command-handlers.ts's `fortConflict` /
 * `buildingRelayBeacon` exception) and the shared registry
 * (noConflictingStructure in structure-registry.ts) both explicitly allow a
 * Fort and a Relay Beacon to share a tile. The "Build Fort" button already
 * reflects this (it stays available on a tile with an existing Relay
 * Beacon), but the "Build Relay Beacon" button had a leftover `!tile.fort`
 * guard that hid it whenever a Fort already existed on the tile -- the
 * reverse direction never got the same fix. See #1698/#1697/agent/relay-beacon-fort
 * for the original Fort+Relay Beacon coexistence work.
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
  state.resourceSlots = {
    supply: { FOOD: 10, TITANIUM: 10, CRYSTAL: 10, UMBRITE: 10 },
    demand: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 }
  };
  return state;
};

describe("Build Relay Beacon shows on a tile that already has a Fort", () => {
  it("offers build_relay_beacon on an owned SETTLED dock tile with an existing Fort", () => {
    const state = richState();
    const dockWithFort: Tile = {
      x: 3,
      y: 3,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      dockId: "dock-1",
      fort: { ownerId: "me", variant: "WOODEN_FORT", status: "active" }
    } as Tile;
    state.tiles.set(keyFor(3, 3), dockWithFort);

    const actions = menuActionsForSingleTile(state, dockWithFort, baseDeps as never);
    const action = findAction(actions, "build_relay_beacon" as TileActionDef["id"]);
    expect(action).toBeDefined();
  });

  it("still hides build_relay_beacon when the tile has a siege outpost, observatory, or economic structure", () => {
    const state = richState();
    const withSiege: Tile = {
      x: 4,
      y: 4,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      siegeOutpost: { ownerId: "me", variant: "SIEGE_OUTPOST", status: "active" }
    } as Tile;
    state.tiles.set(keyFor(4, 4), withSiege);

    const actions = menuActionsForSingleTile(state, withSiege, baseDeps as never);
    expect(findAction(actions, "build_relay_beacon" as TileActionDef["id"])).toBeUndefined();
  });
});
