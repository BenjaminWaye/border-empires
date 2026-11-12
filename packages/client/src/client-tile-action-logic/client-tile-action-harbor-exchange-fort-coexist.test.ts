/**
 * Regression test: Fort/Palisade build must be offered on a tile that
 * already has an active Harbor Exchange (HARBOR_EXCHANGE) economic structure
 * (e.g. a dock with a Harbor Exchange on it), same as the existing
 * Relay Beacon carve-out (see client-tile-action-settle-build.test.ts's
 * "Palisade / Fort builds on a tile with an existing Relay Beacon" describe
 * block). Prior to this fix, hasRelayBeacon was checked in the Fort-gating
 * OR-conditions but there was no matching hasHarborExchange check, so a dock
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

describe("Palisade / Fort builds on a dock with an existing Harbor Exchange (HARBOR_EXCHANGE)", () => {
  const harborExchangeDockTile = (): Tile => ({
    x: 3, y: 3, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", dockId: "dock-1",
    economicStructure: { ownerId: "me", type: "HARBOR_EXCHANGE", status: "active" }
  } as Tile);

  const tierOption = (action: TileActionDef | undefined, label: string) => action?.tierOptions?.find((entry) => entry.label === label);

  it("offers the Fortify row with a buildable Palisade on a Harbor Exchange dock tile", () => {
    const state = richState();
    const tile = harborExchangeDockTile();
    state.tiles.set(keyFor(3, 3), tile);

    const action = findAction(menuActionsForSingleTile(state, tile, baseDeps as never), "build_fortification");
    expect(action).toMatchObject({ label: "Fortify" });
    expect(action?.disabled).not.toBe(true);
    expect(tierOption(action, "Palisade")?.disabled).toBe(false);
  });

  it("offers a buildable Fort tier on a Harbor Exchange dock tile once the Titanium Forge Module is installed -- Fort lives in a separate tile field and coexists with the Harbor Exchange", () => {
    const state = richState();
    state.techIds = ["masonry"];
    state.tiles.set(keyFor(8, 8), { x: 8, y: 8, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", afc: { ownerId: "me", status: "active", modules: ["masonry"] } } as Tile);
    const tile = harborExchangeDockTile();
    state.tiles.set(keyFor(3, 3), tile);

    const action = findAction(menuActionsForSingleTile(state, tile, baseDeps as never), "build_fortification");
    expect(tierOption(action, "Fort")).toMatchObject({ disabled: false, tier: "FORT" });
  });
});
