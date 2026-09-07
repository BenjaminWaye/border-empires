/**
 * Regression test: Fort/Palisade build must be offered on a tile that
 * already has an active Harbor Exchange (CUSTOMS_HOUSE) economic structure
 * (e.g. a dock with a Harbor Exchange on it), same as the existing
 * Relay Beacon carve-out (see client-tile-action-settle-build.test.ts's
 * "Palisade / Fort builds on a tile with an existing Relay Beacon" describe
 * block). Prior to this fix, hasRelayBeacon was checked in the Fort-gating
 * OR-conditions but there was no matching hasCustomsHouse check, so a dock
 * with a Harbor Exchange looked "already has structure" and hid both
 * "Build Palisade" and "Build Fort" -- mirrors the sim-side fix in
 * runtime-structure-command-handlers.ts's economicConflict check.
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

describe("Palisade / Fort builds on a dock with an existing Harbor Exchange (CUSTOMS_HOUSE)", () => {
  const customsHouseDockTile = (): Tile => ({
    x: 3, y: 3, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", dockId: "dock-1",
    economicStructure: { ownerId: "me", type: "CUSTOMS_HOUSE", status: "active" }
  } as Tile);

  it("shows build_wooden_fort (Build Palisade) on a Harbor Exchange dock tile", () => {
    const state = richState();
    const tile = customsHouseDockTile();
    state.tiles.set(keyFor(3, 3), tile);

    const actions = menuActionsForSingleTile(state, tile, baseDeps as never);
    const action = findAction(actions, "build_wooden_fort");
    expect(action).toBeDefined();
    expect(action?.label).toBe("Build Palisade");
    expect(action?.disabled).not.toBe(true);
  });

  it("shows build_fortification (Build Fort) on a Harbor Exchange dock tile once Ironclad Masonry is known -- Fort lives in a separate tile field and coexists with the Harbor Exchange", () => {
    const state = richState();
    state.techIds = ["masonry"];
    const tile = customsHouseDockTile();
    state.tiles.set(keyFor(3, 3), tile);

    const actions = menuActionsForSingleTile(state, tile, baseDeps as never);
    const action = findAction(actions, "build_fortification");
    expect(action).toBeDefined();
    expect(action?.label).toBe("Build Fort");
    expect(action?.disabled).not.toBe(true);
    expect(action?.disabledReason).not.toBe("Tile already has structure");
  });
});
