/**
 * Coverage for the always-show Buildings tab + auto-settle-then-build work.
 *
 * The Buildings tab now appears on any tile the player owns, whether SETTLED
 * or FRONTIER, and clicking "Build X" on an owned-but-FRONTIER tile queues a
 * settle-then-build chain. On the menu-generation side this means each
 * building's gate no longer requires `ownershipState === "SETTLED"`, and the
 * FRONTIER cost/time preview combines the settle cost/time with the
 * structure's own cost/time ("settle + build" label) plus a
 * " • settles this tile first" detail suffix.
 *
 * Covers a representative sample: FARMSTEAD (resource-gated, no slot),
 * MARKET (town-support), LIGHT_OUTPOST (previously only ever built directly on
 * a settled tile via a bespoke path), and FOUNDRY (placement-overlay type).
 */
import { describe, expect, it } from "vitest";
import { SETTLE_COST, SETTLE_MANPOWER_COST, structureBuildDurationMs, structureBuildManpowerCost } from "@border-empires/shared";

import { createInitialState } from "../client-state/client-state.js";
import { settleDurationMsForState } from "../client-queue-logic/client-queue-logic.js";
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
  return state;
};

const frontierCostLabel = (state: ReturnType<typeof createInitialState>, tile: Tile, type: Parameters<typeof structureBuildDurationMs>[0]): string => {
  const totalGold = SETTLE_COST + 500;
  const totalManpower = SETTLE_MANPOWER_COST + structureBuildManpowerCost(type);
  const totalMs = settleDurationMsForState(state, tile) + structureBuildDurationMs(type);
  return `${totalGold} gold, ${totalManpower} m.p. • settle + build • ${Math.round(totalMs / 60000)}m total`;
};

describe("settle + build — resource-gated building (FARMSTEAD)", () => {
  it("shows build_farmstead on a SETTLED owned FARM tile with the plain cost and no settle suffix", () => {
    const state = richState();
    state.techIds = ["agriculture"];
    const settled: Tile = { x: 3, y: 3, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", resource: "FARM" } as Tile;
    state.tiles.set(keyFor(3, 3), settled);

    const actions = menuActionsForSingleTile(state, settled, baseDeps as never);
    const action = findAction(actions, "build_farmstead");
    expect(action).toBeDefined();
    expect(action?.disabled).not.toBe(true);
    expect(action?.detail).toBe("");
    expect(action?.cost).not.toContain("settle + build");
    expect(action?.cost).toContain("+50% food");
  });

  it("shows build_farmstead on a FRONTIER owned FARM tile with a settle + build total and suffix", () => {
    const state = richState();
    state.techIds = ["agriculture"];
    const frontier: Tile = { x: 3, y: 3, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER", resource: "FARM" } as Tile;
    state.tiles.set(keyFor(3, 3), frontier);

    const actions = menuActionsForSingleTile(state, frontier, baseDeps as never);
    const action = findAction(actions, "build_farmstead");
    expect(action).toBeDefined();
    expect(action?.disabled).not.toBe(true);
    expect(action?.detail).toBe(" • settles this tile first");
    expect(action?.cost).toBe(frontierCostLabel(state, frontier, "FARMSTEAD"));
  });

  it("stays disabled for missing tech on a FRONTIER owned tile", () => {
    const state = richState();
    const frontier: Tile = { x: 3, y: 3, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER", resource: "FARM" } as Tile;
    state.tiles.set(keyFor(3, 3), frontier);

    const actions = menuActionsForSingleTile(state, frontier, baseDeps as never);
    const action = findAction(actions, "build_farmstead");
    expect(action).toBeDefined();
    expect(action?.disabled).toBe(true);
    expect(action?.disabledReason).toBe("Requires Agrarian Works");
  });
});

describe("settle + build — town-support building (MARKET)", () => {
  it("shows build_market on a FRONTIER owned tile supported by a nearby town", () => {
    const state = richState();
    state.techIds = ["trade"];
    state.resourceSlots.supply.FOOD = 1;
    const frontier: Tile = { x: 3, y: 3, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER" } as Tile;
    state.tiles.set(keyFor(3, 3), frontier);

    const deps = {
      ...baseDeps,
      supportedOwnedTownsForTile: () => [
        { x: 10, y: 10, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", town: { populationTier: "TOWN", goldPerMinute: 50 } } as Tile
      ]
    };
    const actions = menuActionsForSingleTile(state, frontier, deps as never);
    const action = findAction(actions, "build_market");
    expect(action).toBeDefined();
    expect(action?.disabled).not.toBe(true);
    expect(action?.detail).toBe(" • settles this tile first");
    expect(action?.cost).toBe(frontierCostLabel(state, frontier, "MARKET"));
  });
});

describe("settle + build — Light Outpost on an owned FRONTIER tile", () => {
  it("shows build_light_outpost on a FRONTIER owned tile (previously settled-only)", () => {
    const state = richState();
    const frontier: Tile = { x: 3, y: 3, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER", resource: "FARM" } as Tile;
    state.tiles.set(keyFor(3, 3), frontier);

    const actions = menuActionsForSingleTile(state, frontier, baseDeps as never);
    const action = findAction(actions, "build_light_outpost");
    expect(action).toBeDefined();
    expect(action?.disabled).not.toBe(true);
    expect(action?.detail).toBe(" • settles this tile first");
    expect(action?.cost).toBe(frontierCostLabel(state, frontier, "LIGHT_OUTPOST"));
  });
});

describe("settle + build — placement-overlay building (FOUNDRY)", () => {
  it("shows build_foundry on a FRONTIER owned IRON tile with a settle + build total", () => {
    const state = richState();
    state.techIds = ["industrial-extraction"];
    state.resourceSlots.supply.FOOD = 1;
    state.resourceSlots.supply.CRYSTAL = 1;
    const frontier: Tile = { x: 3, y: 3, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER", resource: "IRON" } as Tile;
    state.tiles.set(keyFor(3, 3), frontier);

    const actions = menuActionsForSingleTile(state, frontier, baseDeps as never);
    const action = findAction(actions, "build_foundry");
    expect(action).toBeDefined();
    expect(action?.disabled).not.toBe(true);
    expect(action?.detail).toBe(" • settles this tile first");
    expect(action?.cost).toBe(frontierCostLabel(state, frontier, "FOUNDRY"));
  });
});

describe("settle + build — settled-only building with no resource/town/dock surface (WOODEN_FORT / OBSERVATORY)", () => {
  const bareFrontierState = (techIds: string[]): ReturnType<typeof createInitialState> => {
    const state = richState();
    state.techIds = techIds;
    for (const resource of ["FOOD", "IRON", "CRYSTAL", "SUPPLY"] as const) {
      state.resourceSlots.supply[resource] = 5;
    }
    return state;
  };

  it("shows build_wooden_fort on a bare FRONTIER owned LAND tile with no resource, town, or dock", () => {
    const state = bareFrontierState([]);
    const frontier: Tile = { x: 3, y: 3, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER" } as Tile;
    state.tiles.set(keyFor(3, 3), frontier);

    const actions = menuActionsForSingleTile(state, frontier, baseDeps as never);
    const action = findAction(actions, "build_wooden_fort");
    expect(action).toBeDefined();
    expect(action?.disabled).not.toBe(true);
    expect(action?.detail).toBe(" • settles this tile first");
  });

  it("shows build_observatory on the same bare FRONTIER owned LAND tile", () => {
    const state = bareFrontierState(["crystal-lattices"]);
    const frontier: Tile = { x: 3, y: 3, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER" } as Tile;
    state.tiles.set(keyFor(3, 3), frontier);

    const actions = menuActionsForSingleTile(state, frontier, baseDeps as never);
    const action = findAction(actions, "build_observatory");
    expect(action).toBeDefined();
    expect(action?.disabled).not.toBe(true);
    expect(action?.detail).toBe(" • settles this tile first");
  });
});

describe("Wooden Fort / Light Outpost stay visible as a fallback when their upgrade's resource slot is unavailable", () => {
  const settledTile = (): Tile => ({ x: 3, y: 3, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" } as Tile);

  it("hides build_wooden_fort once Stoneworks is known and a free IRON slot exists (upgrade path is buildable)", () => {
    const state = richState();
    state.techIds = ["masonry"];
    state.resourceSlots.supply.IRON = 1;
    const tile = settledTile();
    state.tiles.set(keyFor(3, 3), tile);

    const actions = menuActionsForSingleTile(state, tile, baseDeps as never);
    expect(findAction(actions, "build_wooden_fort")).toBeUndefined();
    const upgrade = findAction(actions, "build_fortification");
    expect(upgrade?.label).toBe("Build Fort");
    expect(upgrade?.disabled).not.toBe(true);
  });

  it("keeps build_wooden_fort visible when Stoneworks is known but no free IRON slot is available", () => {
    const state = richState();
    state.techIds = ["masonry"];
    state.resourceSlots.supply.IRON = 0;
    const tile = settledTile();
    state.tiles.set(keyFor(3, 3), tile);

    const actions = menuActionsForSingleTile(state, tile, baseDeps as never);
    const woodenFort = findAction(actions, "build_wooden_fort");
    expect(woodenFort).toBeDefined();
    const upgrade = findAction(actions, "build_fortification");
    expect(upgrade?.disabled).toBe(true);
    expect(upgrade?.disabledReason).toBe("Need a free IRON slot");
  });

  it("hides build_light_outpost once Leatherworking is known and a free SUPPLY slot exists (upgrade path is buildable)", () => {
    const state = richState();
    state.techIds = ["leatherworking"];
    state.resourceSlots.supply.SUPPLY = 1;
    state.resourceSlots.supply.FOOD = 1;
    const tile = settledTile();
    state.tiles.set(keyFor(3, 3), tile);

    const actions = menuActionsForSingleTile(state, tile, baseDeps as never);
    expect(findAction(actions, "build_light_outpost")).toBeUndefined();
    const upgrade = findAction(actions, "build_siege_camp");
    expect(upgrade?.label).toBe("Build Siege Outpost");
    expect(upgrade?.disabled).not.toBe(true);
  });

  it("keeps build_light_outpost visible when Leatherworking is known but no free SUPPLY (Fur/Wood) slot is available", () => {
    const state = richState();
    state.techIds = ["leatherworking"];
    state.resourceSlots.supply.SUPPLY = 0;
    state.resourceSlots.supply.FOOD = 1;
    const tile = settledTile();
    state.tiles.set(keyFor(3, 3), tile);

    const actions = menuActionsForSingleTile(state, tile, baseDeps as never);
    const lightOutpost = findAction(actions, "build_light_outpost");
    expect(lightOutpost).toBeDefined();
    expect(lightOutpost?.disabled).not.toBe(true);
    const upgrade = findAction(actions, "build_siege_camp");
    expect(upgrade?.disabled).toBe(true);
    expect(upgrade?.disabledReason).toBe("Need a free SUPPLY slot");
  });
});
