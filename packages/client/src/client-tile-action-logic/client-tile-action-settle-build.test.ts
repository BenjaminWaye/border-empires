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
 * Covers a representative sample: HYDROGARDEN (resource-gated, no slot),
 * MANUFACTORY (town-support), RELAY_BEACON (previously only ever built directly on
 * a settled tile via a bespoke path), and HYDROWORKS (placement-overlay type).
 */
import { describe, expect, it } from "vitest";
import { SETTLE_COST, SETTLE_MANPOWER_COST, structureBuildDurationMs, structureBuildManpowerCost } from "@border-empires/shared";

import { createInitialState } from "../client-state/client-state.js";
import { settleDurationMsForState } from "../client-queue-logic/client-queue-logic.js";
import { buildTimeLabel } from "../client-relay-beacon-build-time/client-relay-beacon-build-time.js";
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
  return `${totalGold} coin, ${totalManpower} m.p. • garrison + build • ${buildTimeLabel(totalMs)} total`;
};

describe("settle + build — resource-gated building (HYDROGARDEN)", () => {
  it("shows build_hydrogarden on a SETTLED owned FARM tile with the plain cost and no garrison suffix", () => {
    const state = richState();
    state.techIds = ["agriculture"];
    const garrisoned: Tile = { x: 3, y: 3, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", resource: "FARM" } as Tile;
    state.tiles.set(keyFor(3, 3), garrisoned);

    const actions = menuActionsForSingleTile(state, garrisoned, baseDeps as never);
    const action = findAction(actions, "build_hydrogarden");
    expect(action).toBeDefined();
    expect(action?.disabled).not.toBe(true);
    expect(action?.detail).toBe("");
    expect(action?.cost).not.toContain("garrison + build");
    expect(action?.cost).toContain("FOOD slot");
  });

  it("shows the build time shortened by the player's economic build-speed effect", () => {
    const state = richState();
    state.techIds = ["agriculture", "fast-econ"];
    state.techCatalog = [{ id: "fast-econ", name: "Fast", tier: 1, description: "", mods: {}, effects: { economicStructureBuildSpeedMult: 1.25 }, requirements: { gold: 0, resources: {} } }];
    const garrisoned: Tile = { x: 3, y: 3, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", resource: "FARM" } as Tile;
    state.tiles.set(keyFor(3, 3), garrisoned);

    const action = findAction(menuActionsForSingleTile(state, garrisoned, baseDeps as never), "build_hydrogarden");
    expect(action?.cost).toContain(` • ${buildTimeLabel(Math.round(structureBuildDurationMs("HYDROGARDEN") / 1.25))} • `);
    expect(action?.cost).not.toContain(` • ${buildTimeLabel(structureBuildDurationMs("HYDROGARDEN"))} • `);
  });

  it("shows build_hydrogarden on a FRONTIER owned FARM tile with a garrison + build total and suffix", () => {
    const state = richState();
    state.techIds = ["agriculture"];
    const frontier: Tile = { x: 3, y: 3, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER", resource: "FARM" } as Tile;
    state.tiles.set(keyFor(3, 3), frontier);

    const actions = menuActionsForSingleTile(state, frontier, baseDeps as never);
    const action = findAction(actions, "build_hydrogarden");
    expect(action).toBeDefined();
    expect(action?.disabled).not.toBe(true);
    expect(action?.detail).toBe(" • garrisons this tile first");
    expect(action?.cost).toBe(frontierCostLabel(state, frontier, "HYDROGARDEN"));
  });

  it("stays disabled for missing tech on a FRONTIER owned tile", () => {
    const state = richState();
    const frontier: Tile = { x: 3, y: 3, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER", resource: "FARM" } as Tile;
    state.tiles.set(keyFor(3, 3), frontier);

    const actions = menuActionsForSingleTile(state, frontier, baseDeps as never);
    const action = findAction(actions, "build_hydrogarden");
    expect(action).toBeDefined();
    expect(action?.disabled).toBe(true);
    expect(action?.disabledReason).toBe("Requires Hyperfeed Seedstock Consignment");
  });
});

describe("settle + build — town-support building (MANUFACTORY)", () => {
  it("shows build_manufactory on a FRONTIER owned tile supported by a nearby town", () => {
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
    const action = findAction(actions, "build_manufactory");
    expect(action).toBeDefined();
    expect(action?.disabled).not.toBe(true);
    expect(action?.detail).toBe(" • garrisons this tile first");
    expect(action?.cost).toBe(frontierCostLabel(state, frontier, "MANUFACTORY"));
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
    expect(action?.detail).toBe(" • garrisons this tile first");
    // A player's first beacons cost the discounted 50 MP and place instantly (D12), so
    // the chain total is settle + 50 MP and the settle time alone -- matching what the
    // server charges, not the flat 100 MP / stale 1m build time this used to show.
    const settleLabel = buildTimeLabel(settleDurationMsForState(state, frontier));
    expect(action?.cost).toBe(`${SETTLE_COST + 500} coin, ${SETTLE_MANPOWER_COST + 50} m.p. • garrison + build • ${settleLabel} total`);
  });

  it("shows build_relay_beacon in both the Actions and Buildings tabs on a FRONTIER tile, but Buildings only on a SETTLED tile", () => {
    const state = richState();
    const frontier: Tile = { x: 3, y: 3, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER", resource: "FARM" } as Tile;
    state.tiles.set(keyFor(3, 3), frontier);
    const frontierTabs = splitTileActionsIntoTabs(menuActionsForSingleTile(state, frontier, baseDeps as never), state);
    expect(frontierTabs.actions.some((a) => a.id === "build_relay_beacon")).toBe(true);
    expect(frontierTabs.buildings.some((a) => a.id === "build_relay_beacon")).toBe(true);

    const garrisoned: Tile = { x: 4, y: 3, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", resource: "FARM" } as Tile;
    state.tiles.set(keyFor(4, 3), garrisoned);
    const settledTabs = splitTileActionsIntoTabs(menuActionsForSingleTile(state, garrisoned, baseDeps as never), state);
    expect(settledTabs.buildings.some((a) => a.id === "build_relay_beacon")).toBe(true);
    expect(settledTabs.actions.some((a) => a.id === "build_relay_beacon")).toBe(false);
  });
});

describe("settle + build — placement-overlay building (HYDROWORKS)", () => {
  it("shows build_hydroworks on a FRONTIER owned TITANIUM tile with a garrison + build total", () => {
    const state = richState();
    state.techIds = ["irrigation"];
    const frontier: Tile = { x: 3, y: 3, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER", resource: "TITANIUM" } as Tile;
    state.tiles.set(keyFor(3, 3), frontier);

    const actions = menuActionsForSingleTile(state, frontier, baseDeps as never);
    const action = findAction(actions, "build_hydroworks");
    expect(action).toBeDefined();
    expect(action?.disabled).not.toBe(true);
    expect(action?.detail).toBe(" • garrisons this tile first");
    expect(action?.cost).toBe(frontierCostLabel(state, frontier, "HYDROWORKS"));
  });
});

describe("settle + build — settled-only building with no resource/town/dock surface (PALISADE / OBSERVATORY)", () => {
  const bareFrontierState = (techIds: string[]): ReturnType<typeof createInitialState> => {
    const state = richState();
    state.techIds = techIds;
    for (const resource of ["FOOD", "TITANIUM", "CRYSTAL", "UMBRITE"] as const) {
      state.resourceSlots.supply[resource] = 5;
    }
    return state;
  };

  it("offers Fortify (with a buildable Palisade) on a bare FRONTIER owned LAND tile with no resource, town, or dock", () => {
    const state = bareFrontierState([]);
    const frontier: Tile = { x: 3, y: 3, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER" } as Tile;
    state.tiles.set(keyFor(3, 3), frontier);

    const actions = menuActionsForSingleTile(state, frontier, baseDeps as never);
    const action = findAction(actions, "build_fortification");
    expect(action?.disabled).not.toBe(true);
    expect(action?.detail).toBe(" • garrisons this tile first");
    expect(action?.tierOptions?.find((entry) => entry.label === "Palisade")?.disabled).toBe(false);
  });

  it("shows build_observatory on the same bare FRONTIER owned LAND tile", () => {
    const state = bareFrontierState(["crystal-lattices"]);
    const frontier: Tile = { x: 3, y: 3, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER" } as Tile;
    state.tiles.set(keyFor(3, 3), frontier);

    const actions = menuActionsForSingleTile(state, frontier, baseDeps as never);
    const action = findAction(actions, "build_observatory");
    expect(action).toBeDefined();
    expect(action?.disabled).not.toBe(true);
    expect(action?.detail).toBe(" • garrisons this tile first");
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

    const garrisoned: Tile = { x: 3, y: 3, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" } as Tile;
    state.tiles.set(keyFor(3, 3), garrisoned);

    const actionsOneFree = menuActionsForSingleTile(state, garrisoned, baseDeps as never);
    const disabled = findAction(actionsOneFree, "build_observatory");
    expect(disabled?.disabled).toBe(true);
    // Names the actual count required (2) and how many are free (1) --
    // previously always read the flat "Need a free CRYSTAL slot" regardless
    // of the requirement, indistinguishable from a genuine 1-slot shortfall
    // even though freeing exactly one more slot wouldn't have been enough.
    expect(disabled?.disabledReason).toBe("Need 2 free CRYSTAL slots (have 1)");

    // With a 2nd free CRYSTAL slot (now 2 total free), the 2nd Observatory becomes buildable.
    state.resourceSlots.supply.CRYSTAL = 3;
    const actionsTwoFree = menuActionsForSingleTile(state, garrisoned, baseDeps as never);
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

const tierOption = (action: TileActionDef | undefined, label: string) => action?.tierOptions?.find((entry) => entry.label === label);

describe("Fortify row: Palisade always sits beside the Fort tiers", () => {
  const settledTile = (): Tile => ({ x: 3, y: 3, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" } as Tile);
  const afcAt8 = (afc: NonNullable<Tile["afc"]>, ownerId = "me"): Tile => ({ x: 8, y: 8, terrain: "LAND", ownerId, ownershipState: "SETTLED", afc } as Tile);
  const fortifyRow = (afcTile: Tile | undefined, configure: (state: ReturnType<typeof richState>) => void = () => {}): TileActionDef | undefined => {
    const state = richState();
    state.techIds = ["masonry"];
    state.resourceSlots.supply.TITANIUM = 1;
    state.resourceSlots.supply.FOOD = 1;
    configure(state);
    if (afcTile) state.tiles.set(keyFor(afcTile.x, afcTile.y), afcTile);
    const tile = settledTile();
    state.tiles.set(keyFor(3, 3), tile);
    return findAction(menuActionsForSingleTile(state, tile, baseDeps as never), "build_fortification");
  };

  it("offers both Palisade and Fort once the Titanium Forge Module is installed and a TITANIUM slot is free", () => {
    const row = fortifyRow(afcAt8({ ownerId: "me", status: "active", modules: ["masonry"] }));
    expect(row?.label).toBe("Fortify");
    expect(tierOption(row, "Palisade")?.disabled).toBe(false);
    expect(tierOption(row, "Fort")).toMatchObject({ disabled: false, tier: "FORT" });
  });

  // Regression: a waystation granted masonry (the Titanium Forge AFC module)
  // without installing it on an AFC. The Fort tier must explain why and the
  // Palisade must stay buildable -- the bug left a garrisoned tile with no
  // fortification option at all.
  it("keeps Palisade buildable and explains the Fort when the module is known but not installed", () => {
    const row = fortifyRow(undefined);
    expect(row?.disabled).not.toBe(true);
    expect(tierOption(row, "Palisade")?.disabled).toBe(false);
    expect(tierOption(row, "Fort")).toMatchObject({ disabled: true, disabledReason: "Install masonry on an active AFC" });
  });

  it("treats an inactive AFC, or someone else's, as no install", () => {
    for (const afc of [afcAt8({ ownerId: "me", status: "inactive", modules: ["masonry"] }), afcAt8({ ownerId: "rival", status: "active", modules: ["masonry"] }, "rival")]) {
      expect(tierOption(fortifyRow(afc), "Fort")?.disabled).toBe(true);
    }
  });

  it("under Fortification Patterns still needs the module installed (the waiver covers the tech, not the install)", () => {
    const row = fortifyRow(undefined, (state) => {
      state.techIds = [];
      state.domainIds = ["afc-bastion-2"]; // Fortification Patterns
    });
    expect(tierOption(row, "Palisade")?.disabled).toBe(false);
    expect(tierOption(row, "Fort")?.disabledReason).toMatch(/^Install .* on an active AFC$/);
  });

  it("reports a missing TITANIUM slot on the Fort tier only", () => {
    const row = fortifyRow(afcAt8({ ownerId: "me", status: "active", modules: ["masonry"] }), (state) => { state.resourceSlots.supply.TITANIUM = 0; });
    expect(tierOption(row, "Palisade")?.disabled).toBe(false);
    expect(tierOption(row, "Fort")).toMatchObject({ disabled: true, disabledReason: "Need a free TITANIUM slot" });
  });
});

describe("Relay Beacon stays independently choosable from the Siege row", () => {
  const settledTile = (): Tile => ({ x: 3, y: 3, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" } as Tile);

  it("keeps build_relay_beacon visible once Leatherworking is known and a free UMBRITE slot exists", () => {
    const state = richState();
    state.techIds = ["leatherworking"];
    state.resourceSlots.supply.UMBRITE = 1;
    state.resourceSlots.supply.FOOD = 1;
    const tile = settledTile();
    state.tiles.set(keyFor(3, 3), tile);

    const actions = menuActionsForSingleTile(state, tile, baseDeps as never);
    expect(findAction(actions, "build_relay_beacon")?.disabled).not.toBe(true);
    const siege = findAction(actions, "build_siege_camp");
    expect(siege?.label).toBe("Siege");
    expect(tierOption(siege, "Siege Battery")?.disabled).toBe(false);
  });

  it("keeps build_relay_beacon visible when Leatherworking is known but no free UMBRITE slot is available", () => {
    const state = richState();
    state.techIds = ["leatherworking"];
    state.resourceSlots.supply.UMBRITE = 0;
    state.resourceSlots.supply.FOOD = 1;
    const tile = settledTile();
    state.tiles.set(keyFor(3, 3), tile);

    const actions = menuActionsForSingleTile(state, tile, baseDeps as never);
    expect(findAction(actions, "build_relay_beacon")?.disabled).not.toBe(true);
    const siege = findAction(actions, "build_siege_camp");
    expect(siege?.disabled).toBe(true);
    expect(siege?.disabledReason).toBe("Need a free UMBRITE slot");
  });
});

describe("Palisade / Fort builds on a tile with an existing Relay Beacon", () => {
  const relayBeaconTile = (): Tile => ({
    x: 3, y: 3, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED",
    economicStructure: { ownerId: "me", type: "RELAY_BEACON", status: "active" }
  } as Tile);

  it("offers a buildable Palisade on a Relay Beacon tile, matching the server's carve-out for the beacon", () => {
    const state = richState();
    state.resourceSlots.supply.FOOD = 1;
    const tile = relayBeaconTile();
    state.tiles.set(keyFor(3, 3), tile);

    const row = findAction(menuActionsForSingleTile(state, tile, baseDeps as never), "build_fortification");
    expect(row?.label).toBe("Fortify");
    expect(tierOption(row, "Palisade")?.disabled).toBe(false);
  });

  it("offers a buildable Fort tier on a Relay Beacon tile once the module is installed -- Fort lives in a separate tile field and coexists with the beacon", () => {
    const state = richState();
    state.techIds = ["masonry"];
    state.resourceSlots.supply.TITANIUM = 1;
    state.tiles.set(keyFor(8, 8), { x: 8, y: 8, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", afc: { ownerId: "me", status: "active", modules: ["masonry"] } } as Tile);
    const tile = relayBeaconTile();
    state.tiles.set(keyFor(3, 3), tile);

    const row = findAction(menuActionsForSingleTile(state, tile, baseDeps as never), "build_fortification");
    expect(tierOption(row, "Fort")).toMatchObject({ disabled: false, tier: "FORT" });
  });
});
