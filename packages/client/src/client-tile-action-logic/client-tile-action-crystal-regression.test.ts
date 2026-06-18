import { describe, expect, it } from "vitest";

import { createInitialState } from "../client-state/client-state.js";
import { menuActionsForSingleTile } from "./client-tile-action-logic.js";
import { splitTileActionsIntoTabs } from "../client-tile-action-support/client-tile-action-support.js";
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

const stateWithSignalFires = (): ReturnType<typeof createInitialState> => {
  const state = createInitialState();
  state.me = "me";
  state.techIds = ["signal-fires"];
  state.strategicResources.CRYSTAL = 500;
  state.gold = 10000;
  return state;
};

describe("crystal core actions regression", () => {
  it("shows Aether Purge disabled with 'observatory in range' reason on enemy tile when no observatory is owned", () => {
    const state = stateWithSignalFires();
    const enemyTile: Tile = {
      x: 5,
      y: 5,
      terrain: "LAND",
      ownerId: "ai-1",
      ownershipState: "SETTLED",
      fort: { ownerId: "ai-1", status: "active" }
    } as Tile;
    state.tiles.set(keyFor(5, 5), enemyTile);

    const actions = menuActionsForSingleTile(state, enemyTile, baseDeps as never);
    const lance = findAction(actions, "aether_lance");
    expect(lance).toBeDefined();
    expect(lance).toMatchObject({
      disabled: true,
      disabledReason: "Need active observatory in range"
    });
  });

  it("shows Aether Purge disabled with 'Cannot purge your own tiles' on own tile", () => {
    const state = stateWithSignalFires();
    const obsTile: Tile = {
      x: 0,
      y: 0,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      observatory: { ownerId: "me", status: "active" }
    } as Tile;
    state.tiles.set(keyFor(0, 0), obsTile);
    const ownTile: Tile = {
      x: 1,
      y: 1,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED"
    } as Tile;
    state.tiles.set(keyFor(1, 1), ownTile);

    const actions = menuActionsForSingleTile(state, ownTile, baseDeps as never);
    const lance = findAction(actions, "aether_lance");
    expect(lance).toBeDefined();
    expect(lance).toMatchObject({
      disabled: true,
      disabledReason: "Cannot purge your own tiles"
    });
  });

  it("shows Aether Purge enabled on enemy town tiles", () => {
    const state = stateWithSignalFires();
    const obsTile: Tile = {
      x: 0,
      y: 0,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      observatory: { ownerId: "me", status: "active" }
    } as Tile;
    state.tiles.set(keyFor(0, 0), obsTile);
    const enemyTown: Tile = {
      x: 2,
      y: 2,
      terrain: "LAND",
      ownerId: "ai-1",
      ownershipState: "SETTLED",
      town: { populationTier: "CITY" } as never
    } as Tile;
    state.tiles.set(keyFor(2, 2), enemyTown);

    const actions = menuActionsForSingleTile(state, enemyTown, baseDeps as never);
    const lance = findAction(actions, "aether_lance");
    expect(lance).toBeDefined();
    expect(lance?.disabled).not.toBe(true);
  });

  it("shows Aether Purge enabled on enemy monument tiles because it only purges ownership", () => {
    const state = stateWithSignalFires();
    const obsTile: Tile = {
      x: 0,
      y: 0,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      observatory: { ownerId: "me", status: "active" }
    } as Tile;
    state.tiles.set(keyFor(0, 0), obsTile);
    const enemyMonument: Tile = {
      x: 2,
      y: 2,
      terrain: "LAND",
      ownerId: "ai-1",
      ownershipState: "SETTLED",
      economicStructure: { type: "WORLD_ENGINE", ownerId: "ai-1", status: "active" }
    } as Tile;
    state.tiles.set(keyFor(2, 2), enemyMonument);

    const actions = menuActionsForSingleTile(state, enemyMonument, baseDeps as never);
    const lance = findAction(actions, "aether_lance");
    expect(lance).toBeDefined();
    expect(lance?.disabled).not.toBe(true);
  });

  it("shows Aether Purge ENABLED when all gates pass on enemy fort within observatory range", () => {
    const state = stateWithSignalFires();
    const obsTile: Tile = {
      x: 0,
      y: 0,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      observatory: { ownerId: "me", status: "active", cooldownUntil: 0 }
    } as Tile;
    state.tiles.set(keyFor(0, 0), obsTile);
    const enemyFort: Tile = {
      x: 2,
      y: 2,
      terrain: "LAND",
      ownerId: "ai-1",
      ownershipState: "SETTLED",
      fort: { ownerId: "ai-1", status: "active" }
    } as Tile;
    state.tiles.set(keyFor(2, 2), enemyFort);

    const actions = menuActionsForSingleTile(state, enemyFort, baseDeps as never);
    const lance = findAction(actions, "aether_lance");
    expect(lance).toBeDefined();
    expect(lance?.disabled).not.toBe(true);
  });

  it("surfaces Aether Purge row on unclaimed frontier tile (disabled, with reason)", () => {
    const state = stateWithSignalFires();
    const obsTile: Tile = {
      x: 0,
      y: 0,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      observatory: { ownerId: "me", status: "active" }
    } as Tile;
    state.tiles.set(keyFor(0, 0), obsTile);
    const frontier: Tile = { x: 3, y: 3, terrain: "LAND" } as Tile;
    state.tiles.set(keyFor(3, 3), frontier);

    const actions = menuActionsForSingleTile(state, frontier, baseDeps as never);
    const lance = findAction(actions, "aether_lance");
    expect(lance).toBeDefined();
    expect(lance).toMatchObject({
      disabled: true,
      disabledReason: "Target enemy settled or frontier land"
    });
  });

  it("shows Aether Purge enabled on enemy frontier tiles", () => {
    const state = stateWithSignalFires();
    const obsTile: Tile = {
      x: 0,
      y: 0,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      observatory: { ownerId: "me", status: "active" }
    } as Tile;
    state.tiles.set(keyFor(0, 0), obsTile);
    const frontier: Tile = {
      x: 3,
      y: 3,
      terrain: "LAND",
      ownerId: "ai-1",
      ownershipState: "FRONTIER"
    } as Tile;
    state.tiles.set(keyFor(3, 3), frontier);

    const actions = menuActionsForSingleTile(state, frontier, baseDeps as never);
    const lance = findAction(actions, "aether_lance");
    expect(lance).toBeDefined();
    expect(lance?.disabled).not.toBe(true);
  });
});

describe("crystal tab visibility regression", () => {
  it("crystal tab stays visible when all crystal actions are disabled (e.g. on cooldown)", () => {
    // Signal-fires gives aether_lance. No observatory is placed, so all crystal actions
    // will be disabled with 'Need active observatory in range'. The crystal tab must still
    // be emitted so the player can see the disabled reason.
    const state = stateWithSignalFires();
    const enemyTile: Tile = {
      x: 10,
      y: 10,
      terrain: "LAND",
      ownerId: "ai-1",
      ownershipState: "SETTLED"
    } as Tile;
    state.tiles.set(keyFor(10, 10), enemyTile);

    const actions = menuActionsForSingleTile(state, enemyTile, baseDeps as never);
    const tabs = splitTileActionsIntoTabs(actions, state);

    // All crystal rows disabled — tab must still be non-empty
    expect(tabs.crystal.length).toBeGreaterThan(0);
    // Every row in the crystal tab should be disabled
    expect(tabs.crystal.every((a) => a.disabled)).toBe(true);
  });
});
