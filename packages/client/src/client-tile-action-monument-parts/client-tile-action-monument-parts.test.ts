import { describe, expect, it } from "vitest";

import { createInitialState } from "../client-state/client-state.js";
import { menuActionsForSingleTile } from "../client-tile-action-logic/client-tile-action-logic.js";
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
  pickOriginForTarget: () => undefined,
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
  ownerSpawnShieldActive: () => false
} as const;

const findAction = (actions: TileActionDef[], id: TileActionDef["id"]): TileActionDef | undefined =>
  actions.find((action) => action.id === id);

const greatCityTile = (): Tile =>
  ({
    x: 0,
    y: 0,
    terrain: "LAND",
    ownerId: "me",
    ownershipState: "SETTLED",
    town: { populationTier: "GREAT_CITY" } as never
  }) as Tile;

describe("monument component build-menu gate", () => {
  it("disables a monument part build with 'Part already built in nearby town' once the player owns it elsewhere (active)", () => {
    const state = createInitialState();
    state.me = "me";
    state.techIds = ["urban-mintworks"];
    const city = greatCityTile();
    state.tiles.set(keyFor(0, 0), city);
    state.tiles.set(keyFor(9, 9), {
      x: 9,
      y: 9,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      economicStructure: { type: "IMPERIAL_EXCHANGE_PART_1", ownerId: "me", status: "active" }
    } as Tile);

    const actions = menuActionsForSingleTile(state, city, baseDeps as never);
    const action = findAction(actions, "build_imperial_exchange_part_1");
    expect(action).toMatchObject({
      disabled: true,
      disabledReason: "Part already built in nearby town"
    });
  });

  it("disables a monument part build while a matching one is still under_construction elsewhere", () => {
    const state = createInitialState();
    state.me = "me";
    state.techIds = ["urban-mintworks"];
    const city = greatCityTile();
    state.tiles.set(keyFor(0, 0), city);
    state.tiles.set(keyFor(9, 9), {
      x: 9,
      y: 9,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      economicStructure: { type: "IMPERIAL_EXCHANGE_PART_1", ownerId: "me", status: "under_construction" }
    } as Tile);

    const actions = menuActionsForSingleTile(state, city, baseDeps as never);
    const action = findAction(actions, "build_imperial_exchange_part_1");
    expect(action).toMatchObject({
      disabled: true,
      disabledReason: "Part already built in nearby town"
    });
  });

  it("does not block a DIFFERENT part when only that part type is already owned elsewhere", () => {
    const state = createInitialState();
    state.me = "me";
    state.techIds = ["urban-mintworks"];
    const city = greatCityTile();
    state.tiles.set(keyFor(0, 0), city);
    state.tiles.set(keyFor(9, 9), {
      x: 9,
      y: 9,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      economicStructure: { type: "IMPERIAL_EXCHANGE_PART_1", ownerId: "me", status: "active" }
    } as Tile);

    const actions = menuActionsForSingleTile(state, city, baseDeps as never);
    const action = findAction(actions, "build_imperial_exchange_part_2");
    expect(action?.disabledReason).not.toBe("Part already built in nearby town");
  });

  it("does not block on a rival's part of the same type", () => {
    const state = createInitialState();
    state.me = "me";
    state.techIds = ["urban-mintworks"];
    const city = greatCityTile();
    state.tiles.set(keyFor(0, 0), city);
    state.tiles.set(keyFor(9, 9), {
      x: 9,
      y: 9,
      terrain: "LAND",
      ownerId: "rival",
      ownershipState: "SETTLED",
      economicStructure: { type: "IMPERIAL_EXCHANGE_PART_1", ownerId: "rival", status: "active" }
    } as Tile);

    const actions = menuActionsForSingleTile(state, city, baseDeps as never);
    const action = findAction(actions, "build_imperial_exchange_part_1");
    expect(action?.disabledReason).not.toBe("Part already built in nearby town");
  });
});
