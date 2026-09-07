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
 * MINTWORKS (town-support), RELAY_BEACON (previously only ever built directly on
 * a settled tile via a bespoke path), and FOUNDRY (placement-overlay type).
 */
import { describe, expect, it } from "vitest";
import { SETTLE_COST, SETTLE_MANPOWER_COST, structureBuildDurationMs, structureBuildManpowerCost } from "@border-empires/shared";

import { createInitialState } from "../client-state/client-state.js";
import { settleDurationMsForState } from "../client-queue-logic/client-queue-logic.js";
import { splitTileActionsIntoTabs } from "../client-tile-action-support/client-tile-action-support.js";
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
  // A settled town at (0,0) puts (3,3) inside TOWN_REACH_RADIUS (3) --
  // these tests exercise the settle+build chain, not the reach gate, so
  // they need the FRONTIER tile they build against to be in reach.
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
    expect(action?.cost).toContain("FOOD slot");
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

describe("settle + build — town-support building (MINTWORKS)", () => {
  it("shows build_mintworks on a FRONTIER owned tile supported by a nearby town", () => {
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
    const action = findAction(actions, "build_mintworks");
    expect(action).toBeDefined();
    expect(action?.disabled).not.toBe(true);
    expect(action?.detail).toBe(" • settles this tile first");
    expect(action?.cost).toBe(frontierCostLabel(state, frontier, "MINTWORKS"));
  });
});

describe("settle + build — Relay Beacon on an owned FRONTIER tile", () => {
  it("shows build_relay_beacon on a FRONTIER owned tile (previously settled-only)", () => {
    const state = richState();
    const frontier: Tile = { x: 3, y: 3, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER", resource: "FARM" } as Tile;
    state.tiles.set(keyFor(3, 3), frontier);

    const actions = menuActionsForSingleTile(state, frontier, baseDeps as never);
    const action = findAction(actions, "build_relay_beacon");
    expect(action).toBeDefined();
    expect(action?.disabled).not.toBe(true);
    expect(action?.detail).toBe(" • settles this tile first");
    expect(action?.cost).toBe(frontierCostLabel(state, frontier, "RELAY_BEACON"));
  });

  it("shows build_relay_beacon in both the Actions and Buildings tabs on a FRONTIER tile, but Buildings only on a SETTLED tile", () => {
    const state = richState();
    const frontier: Tile = { x: 3, y: 3, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER", resource: "FARM" } as Tile;
    state.tiles.set(keyFor(3, 3), frontier);
    const frontierTabs = splitTileActionsIntoTabs(menuActionsForSingleTile(state, frontier, baseDeps as never), state);
    expect(frontierTabs.actions.some((a) => a.id === "build_relay_beacon")).toBe(true);
    expect(frontierTabs.buildings.some((a) => a.id === "build_relay_beacon")).toBe(true);

    const settled: Tile = { x: 4, y: 3, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", resource: "FARM" } as Tile;
    state.tiles.set(keyFor(4, 3), settled);
    const settledTabs = splitTileActionsIntoTabs(menuActionsForSingleTile(state, settled, baseDeps as never), state);
    expect(settledTabs.buildings.some((a) => a.id === "build_relay_beacon")).toBe(true);
    expect(settledTabs.actions.some((a) => a.id === "build_relay_beacon")).toBe(false);
  });
});

describe("settle + build — placement-overlay building (FOUNDRY)", () => {
  it("shows build_foundry on a FRONTIER owned TITANIUM tile with a settle + build total", () => {
    const state = richState();
    state.techIds = ["industrial-extraction"];
    state.resourceSlots.supply.FOOD = 1;
    state.resourceSlots.supply.CRYSTAL = 1;
    const frontier: Tile = { x: 3, y: 3, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER", resource: "TITANIUM" } as Tile;
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
    for (const resource of ["FOOD", "TITANIUM", "CRYSTAL", "UMBRITE"] as const) {
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

  it("a 2nd Observatory needs 2 free CRYSTAL slots, not the flat 1 the 1st one needed", () => {
    const state = bareFrontierState(["crystal-lattices"]);
    state.me = "me";
    // Already own one active Observatory elsewhere — its own 1-slot demand is
    // netted into resourceSlots.demand, same as the real server-computed value.
    state.tiles.set(keyFor(9, 9), { x: 9, y: 9, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", observatory: { ownerId: "me", status: "active" } } as Tile);
    state.resourceSlots.demand.CRYSTAL = 1;
    // Only 1 CRYSTAL slot free (supply 2 - demand 1) -- not enough for the
    // 2nd copy's 2-slot cost.
    state.resourceSlots.supply.CRYSTAL = 2;

    const settled: Tile = { x: 3, y: 3, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" } as Tile;
    state.tiles.set(keyFor(3, 3), settled);

    const actionsOneFree = menuActionsForSingleTile(state, settled, baseDeps as never);
    const disabled = findAction(actionsOneFree, "build_observatory");
    expect(disabled?.disabled).toBe(true);
    expect(disabled?.disabledReason).toBe("Need a free CRYSTAL slot");

    // With a 2nd free CRYSTAL slot (now 2 total free), the 2nd Observatory becomes buildable.
    state.resourceSlots.supply.CRYSTAL = 3;
    const actionsTwoFree = menuActionsForSingleTile(state, settled, baseDeps as never);
    const enabled = findAction(actionsTwoFree, "build_observatory");
    expect(enabled?.disabled).not.toBe(true);
  });

  it("shows build_observatory (Aether Tower) as buildable on a tile that already has a Fort", () => {
    const state = bareFrontierState(["crystal-lattices"]);
    const tile: Tile = {
      x: 3, y: 3, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED",
      fort: { ownerId: "me", status: "active", variant: "FORT" }
    } as Tile;
    state.tiles.set(keyFor(3, 3), tile);

    const actions = menuActionsForSingleTile(state, tile, baseDeps as never);
    const action = findAction(actions, "build_observatory");
    expect(action).toBeDefined();
    expect(action?.disabled).not.toBe(true);
  });
});

describe("Wooden Fort / Relay Beacon stay visible as a fallback when their upgrade's resource slot is unavailable", () => {
  const settledTile = (): Tile => ({ x: 3, y: 3, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" } as Tile);

  it("hides build_wooden_fort once Stoneworks is known and a free TITANIUM slot exists (upgrade path is buildable)", () => {
    const state = richState();
    state.techIds = ["masonry"];
    state.resourceSlots.supply.TITANIUM = 1;
    const tile = settledTile();
    state.tiles.set(keyFor(3, 3), tile);

    const actions = menuActionsForSingleTile(state, tile, baseDeps as never);
    expect(findAction(actions, "build_wooden_fort")).toBeUndefined();
    const upgrade = findAction(actions, "build_fortification");
    expect(upgrade?.label).toBe("Build Fort");
    expect(upgrade?.disabled).not.toBe(true);
  });

  it("keeps build_wooden_fort visible when Stoneworks is known but no free TITANIUM slot is available", () => {
    const state = richState();
    state.techIds = ["masonry"];
    state.resourceSlots.supply.TITANIUM = 0;
    const tile = settledTile();
    state.tiles.set(keyFor(3, 3), tile);

    const actions = menuActionsForSingleTile(state, tile, baseDeps as never);
    const woodenFort = findAction(actions, "build_wooden_fort");
    expect(woodenFort).toBeDefined();
    const upgrade = findAction(actions, "build_fortification");
    expect(upgrade?.disabled).toBe(true);
    expect(upgrade?.disabledReason).toBe("Need a free TITANIUM slot");
  });

  it("keeps build_relay_beacon visible even once Leatherworking is known and a free UMBRITE slot exists (independently choosable from Siege Outpost)", () => {
    const state = richState();
    state.techIds = ["leatherworking"];
    state.resourceSlots.supply.UMBRITE = 1;
    state.resourceSlots.supply.FOOD = 1;
    const tile = settledTile();
    state.tiles.set(keyFor(3, 3), tile);

    const actions = menuActionsForSingleTile(state, tile, baseDeps as never);
    const relayBeacon = findAction(actions, "build_relay_beacon");
    expect(relayBeacon).toBeDefined();
    expect(relayBeacon?.disabled).not.toBe(true);
    const upgrade = findAction(actions, "build_siege_camp");
    expect(upgrade?.label).toBe("Build Siege Outpost");
    expect(upgrade?.disabled).not.toBe(true);
  });

  it("keeps build_relay_beacon visible when Leatherworking is known but no free UMBRITE slot is available", () => {
    const state = richState();
    state.techIds = ["leatherworking"];
    state.resourceSlots.supply.UMBRITE = 0;
    state.resourceSlots.supply.FOOD = 1;
    const tile = settledTile();
    state.tiles.set(keyFor(3, 3), tile);

    const actions = menuActionsForSingleTile(state, tile, baseDeps as never);
    const relayBeacon = findAction(actions, "build_relay_beacon");
    expect(relayBeacon).toBeDefined();
    expect(relayBeacon?.disabled).not.toBe(true);
    const upgrade = findAction(actions, "build_siege_camp");
    expect(upgrade?.disabled).toBe(true);
    expect(upgrade?.disabledReason).toBe("Need a free UMBRITE slot");
  });
});

describe("Palisade / Fort builds on a tile with an existing Relay Beacon", () => {
  const relayBeaconTile = (): Tile => ({
    x: 3, y: 3, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED",
    economicStructure: { ownerId: "me", type: "RELAY_BEACON", status: "active" }
  } as Tile);

  it("shows build_wooden_fort (Build Palisade) on a Relay Beacon tile, matching the server's carve-out for replacing the beacon", () => {
    const state = richState();
    state.resourceSlots.supply.FOOD = 1;
    const tile = relayBeaconTile();
    state.tiles.set(keyFor(3, 3), tile);

    const actions = menuActionsForSingleTile(state, tile, baseDeps as never);
    const action = findAction(actions, "build_wooden_fort");
    expect(action).toBeDefined();
    expect(action?.label).toBe("Build Palisade");
    expect(action?.disabled).not.toBe(true);
  });

  it("shows build_fortification (Build Fort) on a Relay Beacon tile once Ironclad Masonry is known -- Fort lives in a separate tile field and coexists with the beacon", () => {
    const state = richState();
    state.techIds = ["masonry"];
    state.resourceSlots.supply.TITANIUM = 1;
    const tile = relayBeaconTile();
    state.tiles.set(keyFor(3, 3), tile);

    const actions = menuActionsForSingleTile(state, tile, baseDeps as never);
    const action = findAction(actions, "build_fortification");
    expect(action).toBeDefined();
    expect(action?.label).toBe("Build Fort");
    expect(action?.disabled).not.toBe(true);
    expect(action?.disabledReason).not.toBe("Tile already has structure");
  });
});
