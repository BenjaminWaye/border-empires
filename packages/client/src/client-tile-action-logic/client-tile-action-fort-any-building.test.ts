/**
 * Regression: the Fortify row was hidden on a town support tile holding a
 * Manufactory (any economic structure other than a Relay Beacon / Harbor
 * Exchange) or an Aether Tower, so a fort could not be built there. A
 * fortification now shares a tile with any building; only a siege engine
 * excludes it (runtime-structure-command-handlers.ts).
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


describe("Fortify shows on a tile with any building", () => {
  const withStructure = (extra: Partial<Tile>): Tile => ({ x: 3, y: 3, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", ...extra } as Tile);

  it("offers a buildable Palisade on a tile with a Manufactory", () => {
    const state = richState();
    const tile = withStructure({ economicStructure: { ownerId: "me", type: "MANUFACTORY", status: "active" } } as Partial<Tile>);
    state.tiles.set(keyFor(3, 3), tile);
    const action = findAction(menuActionsForSingleTile(state, tile, baseDeps as never), "build_fortification");
    expect(action).toMatchObject({ label: "Fortify" });
    expect(action?.tierOptions?.find((entry) => entry.label === "Palisade")?.disabled).toBe(false);
  });

  it("offers Fortify on a tile with an Aether Tower", () => {
    const state = richState();
    const tile = withStructure({ observatory: { ownerId: "me", status: "active" } } as Partial<Tile>);
    state.tiles.set(keyFor(3, 3), tile);
    expect(findAction(menuActionsForSingleTile(state, tile, baseDeps as never), "build_fortification")).toBeDefined();
  });

  it("still hides Fortify on a tile with a Siege Battery", () => {
    const state = richState();
    const tile = withStructure({ siegeBattery: { ownerId: "me", variant: "SIEGE_BATTERY", status: "active" } } as Partial<Tile>);
    state.tiles.set(keyFor(3, 3), tile);
    expect(findAction(menuActionsForSingleTile(state, tile, baseDeps as never), "build_fortification")).toBeUndefined();
  });
});
