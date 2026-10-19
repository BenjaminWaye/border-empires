import { describe, expect, it } from "vitest";
import { settleDurationMsForTile } from "../client-constants.js";
import { settleDurationMsForState, settlementSpeedMultiplierForState } from "../client-queue-logic/client-queue-logic.js";
import { createInitialState } from "../client-state/client-state.js";
import { menuActionsForSingleTile } from "../client-tile-action-logic/client-tile-action-logic.js";
import { hasAdjacentSeaEightWay, observatoryTileRank, ownedActiveObservatoryWithinRange, ownedActiveOrBuildingObservatoryCount, shouldOptimisticallyBuildOnSelectedTile, splitTileActionsIntoTabs } from "./client-tile-action-support.js";
import type { DevelopmentSlotSummary } from "../client-queue-logic/client-queue-logic.js";
import type { Tile, TileActionDef } from "../client-types.js";

const state = {
  techIds: ["navigation", "trade", "coinage", "industrial-extraction", "masonry", "crystal-lattices", "leatherworking"],
  localhostDevAetherWall: false
};

describe("settlement speed effects", () => {
  it("uses owned tech and domain settlement speed effects for settle duration labels", () => {
    const progressionState = {
      techIds: ["toolmaking"],
      techCatalog: [
        {
          id: "toolmaking",
          name: "Workshop Standards",
          tier: 1,
          description: "Faster settlement.",
          mods: {},
          effects: { settlementSpeedMult: 1.05 },
          requirements: { gold: 0, resources: {} }
        }
      ],
      domainIds: ["fast-frontier"],
      domainCatalog: [
        {
          id: "fast-frontier",
          tier: 1,
          name: "Fast Frontier",
          description: "Even faster settlement.",
          requiresTechId: "toolmaking",
          mods: {},
          effects: { settlementSpeedMult: 1.1 },
          requirements: { gold: 0, resources: {} }
        }
      ]
    };

    expect(settlementSpeedMultiplierForState(progressionState)).toBeCloseTo(1.155);
    expect(settleDurationMsForState(progressionState, { x: 10, y: 10 })).toBe(Math.round(settleDurationMsForTile(10, 10) / 1.155));
  });
});

describe("splitTileActionsIntoTabs", () => {
  it("keeps crystal-only menu content visible", () => {
    const crystalOnly: TileActionDef[] = [
      {
        id: "aether_bridge",
        label: "Aether Bridge",
        cost: "30 CRYSTAL • crosses up to 4 sea tiles",
        disabled: false
      }
    ];

    expect(splitTileActionsIntoTabs(crystalOnly, state)).toEqual({
      actions: [],
      buildings: [],
      crystal: crystalOnly
    });
  });

  it("shows disabled non-crystal actions with their blocker messages", () => {
    const disabledActions: TileActionDef[] = [
      {
        id: "launch_attack",
        label: "Launch Attack",
        disabled: true,
        disabledReason: "No bordering origin tile or linked dock",
        cost: "No bordering origin tile or linked dock"
      }
    ];

    expect(splitTileActionsIntoTabs(disabledActions, state)).toEqual({
      actions: disabledActions,
      buildings: [],
      crystal: []
    });
  });

  it("keeps a disabled-only Buildings tab visible", () => {
    const disabledBuildings: TileActionDef[] = [
      {
        id: "build_ore_refinery",
        label: "Build Ore Refinery",
        disabled: true,
        disabledReason: "Need 4500 gold",
        cost: "Need 4500 gold"
      }
    ];

    expect(splitTileActionsIntoTabs(disabledBuildings, state)).toEqual({
      actions: [],
      buildings: disabledBuildings,
      crystal: []
    });
  });

  it("keeps build_relay_beacon in Buildings only on a settled tile, but shows it in both Actions and Buildings on a FRONTIER tile", () => {
    const plainRelayBeacon: TileActionDef[] = [
      { id: "build_relay_beacon", label: "Build Relay Beacon", detail: "", disabled: false }
    ];
    expect(splitTileActionsIntoTabs(plainRelayBeacon, state)).toEqual({
      actions: [],
      buildings: plainRelayBeacon,
      crystal: []
    });

    const frontierRelayBeacon: TileActionDef[] = [
      { id: "build_relay_beacon", label: "Build Relay Beacon", detail: " • garrisons this tile first", disabled: false }
    ];
    expect(splitTileActionsIntoTabs(frontierRelayBeacon, state)).toEqual({
      actions: frontierRelayBeacon,
      buildings: frontierRelayBeacon,
      crystal: []
    });
  });

  it("shows build_hydrogarden in both Actions and Buildings while it's actually buildable, but Buildings only once disabled", () => {
    const hydrogardenResearchedState = { ...state, techIds: [...state.techIds, "agriculture"] };

    const readyHydrogarden: TileActionDef[] = [
      { id: "build_hydrogarden", label: "Build Hydrogarden", detail: "50 coin • 2m • +2 FOOD slot", disabled: false }
    ];
    expect(splitTileActionsIntoTabs(readyHydrogarden, hydrogardenResearchedState)).toEqual({
      actions: readyHydrogarden,
      buildings: readyHydrogarden,
      crystal: []
    });

    const disabledHydrogarden: TileActionDef[] = [
      { id: "build_hydrogarden", label: "Build Hydrogarden", detail: "", disabled: true, disabledReason: "Tile already has structure" }
    ];
    expect(splitTileActionsIntoTabs(disabledHydrogarden, hydrogardenResearchedState)).toEqual({
      actions: [],
      buildings: disabledHydrogarden,
      crystal: []
    });
  });

  it("sorts support-only buildings before general settled buildings", () => {
    const rows: TileActionDef[] = [
      {
        id: "build_ore_refinery",
        label: "Build Ore Refinery",
        disabled: false
      },
      {
        id: "build_manufactory",
        label: "Build Manufactory",
        disabled: false
      },
      {
        id: "build_clearing_house",
        label: "Build Clearing House",
        disabled: false
      }
    ];

    expect(splitTileActionsIntoTabs(rows, state).buildings.map((row) => row.id)).toEqual([
      "build_manufactory",
      "build_clearing_house",
      "build_ore_refinery"
    ]);
  });

  it("sorts fort and outpost structures to the bottom of the Buildings tab", () => {
    const rows: TileActionDef[] = [
      {
        id: "build_fortification",
        label: "Build Fort",
        disabled: false
      },
      {
        id: "build_ore_refinery",
        label: "Build Ore Refinery",
        disabled: false
      },
      {
        id: "build_manufactory",
        label: "Build Manufactory",
        disabled: false
      },
      {
        id: "build_observatory",
        label: "Build Observatory",
        disabled: false
      },
      {
        id: "build_relay_beacon",
        label: "Build Relay Beacon",
        disabled: false
      }
    ];

    expect(splitTileActionsIntoTabs(rows, state).buildings.map((row) => row.id)).toEqual([
      "build_manufactory",
      "build_ore_refinery",
      "build_fortification",
      "build_observatory",
      "build_relay_beacon"
    ]);
  });

  it("shows remove-structure actions in the Actions tab", () => {
    const rows: TileActionDef[] = [
      {
        id: "remove_structure",
        label: "Remove Mine",
        disabled: false
      }
    ];

    expect(splitTileActionsIntoTabs(rows, state)).toEqual({
      actions: rows,
      buildings: [],
      crystal: []
    });
  });
});

describe("shouldOptimisticallyBuildOnSelectedTile", () => {
  const townTile: Tile = {
    x: 10,
    y: 10,
    terrain: "LAND",
    ownerId: "me",
    ownershipState: "SETTLED",
    town: {
      type: "MARKET",
      baseGoldPerMinute: 1,
      supportCurrent: 0,
      supportMax: 4,
      goldPerMinute: 1,
      cap: 100,
      isFed: true,
      population: 1000,
      maxPopulation: 2000,
      populationTier: "TOWN",
      connectedTownCount: 0,
      connectedTownBonus: 0,
      hasManufactory: false,
      manufactoryActive: false,
      hasIncubationEngine: false,
      incubationEngineActive: false,
    }
  };

  const supportTile: Tile = {
    x: 11,
    y: 10,
    terrain: "LAND",
    ownerId: "me",
    ownershipState: "SETTLED"
  };

  it("skips optimistic town-square builds for town-support structures", () => {
    expect(shouldOptimisticallyBuildOnSelectedTile("build_incubation_engine", townTile)).toBe(false);
    expect(shouldOptimisticallyBuildOnSelectedTile("build_titanium_works", townTile)).toBe(false);
  });

  it("still allows optimistic builds on real support tiles", () => {
    expect(shouldOptimisticallyBuildOnSelectedTile("build_manufactory", supportTile)).toBe(true);
  });

  it("keeps same-tile structures optimistic on town tiles", () => {
    // Manufactory moved to same-tile/uncapped placement in the tech-tree redesign
    // (per-town cap removed), so it's optimistic on the town tile now too,
    // same as Ore Refinery.
    expect(shouldOptimisticallyBuildOnSelectedTile("build_ore_refinery", townTile)).toBe(true);
    expect(shouldOptimisticallyBuildOnSelectedTile("build_manufactory", townTile)).toBe(true);
  });
});

describe("town support tile actions", () => {
  const supportTileMenuActions = (developmentSlots: DevelopmentSlotSummary): TileActionDef[] => {
    const clientState = createInitialState();
    clientState.me = "me";
    clientState.gold = 500;
    clientState.techIds = ["trade"];
    // §5 (resource slots): MANUFACTORY needs a free FOOD slot at build time now
    // that the old FOOD stockpile check is retired (Step 5 item 4 Slice A).
    clientState.resourceSlots.supply.FOOD = 1;
    const supportTile: Tile = { x: 210, y: 149, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" };
    const town = (x: number, y: number): Tile => ({
      x,
      y,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      town: {
        type: "MARKET",
        baseGoldPerMinute: 1,
        supportCurrent: 1,
        supportMax: 8,
        goldPerMinute: 1,
        cap: 100,
        isFed: true,
        population: 1000,
        maxPopulation: 2000,
        populationTier: "TOWN",
        connectedTownCount: 0,
        connectedTownBonus: 0,
        hasManufactory: false,
        manufactoryActive: false,
        hasIncubationEngine: false,
        incubationEngineActive: false,
      }
    });

    return menuActionsForSingleTile(clientState, supportTile, {
      keyFor: (x: number, y: number) => `${x},${y}`,
      parseKey: (key: string) => {
        const [x, y] = key.split(",").map(Number);
        return { x, y };
      },
      wrapX: (x: number) => x,
      wrapY: (y: number) => y,
      terrainAt: () => "LAND",
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
      developmentSlotSummary: () => developmentSlots,
      developmentSlotReason: () => "No available development slots",
      structureGoldCost: () => 0,
      structureCostText: () => "0 gold",
      supportedOwnedTownsForTile: () => [town(209, 148), town(211, 150)],
      supportedOwnedDocksForTile: () => [],
      townHasSupportStructure: () => false,
      activeTruceWithPlayer: () => undefined,
      pendingTruceWithPlayer: () => undefined,
      ownerSpawnShieldActive: () => false
    } as never);
  };

  it("uses the first assigned town instead of blocking shared support tiles", () => {
    const actions = supportTileMenuActions({ busy: 0, limit: 3, available: 3 });
    expect(actions.find((action) => action.id === "build_manufactory")).toMatchObject({
      disabled: false
    });
    expect(actions.some((action) => action.disabledReason === "Support tile touches multiple towns")).toBe(false);
  });

  // Regression (#2405): full development slots used to append " • queues" to
  // every build button's cost line, which confused players. Orders still
  // queue server-side, but the button must look exactly as it does with free slots.
  it("keeps build buttons enabled with the plain cost when development slots are full", () => {
    const withFreeSlots = supportTileMenuActions({ busy: 0, limit: 3, available: 3 });
    const withFullSlots = supportTileMenuActions({ busy: 3, limit: 3, available: 0 });
    const buildActions = withFullSlots.filter((action) => action.id.startsWith("build_"));
    expect(buildActions.length).toBeGreaterThan(0);
    expect(buildActions.filter((action) => action.cost?.includes("queues"))).toEqual([]);
    expect(withFullSlots.find((action) => action.id === "build_manufactory")).toMatchObject({ disabled: false });
    expect(withFullSlots).toEqual(withFreeSlots);
  });
});

describe("ownedActiveObservatoryWithinRange", () => {
  it("requires an active owned observatory inside the computed cast radius", () => {
    expect(
      ownedActiveObservatoryWithinRange(
        {
          me: "me",
          techIds: ["beacon-towers"],
          techCatalog: [
            {
              id: "beacon-towers",
              name: "Beacon Towers",
              tier: 4,
              description: "",
              mods: {},
              effects: { observatoryRangeBonus: 5 },
              requirements: { gold: 0, resources: {}, canResearch: true, checklist: [] }
            }
          ],
          domainIds: [],
          domainCatalog: [],
          tiles: new Map([
            [
              "10,10",
              {
                x: 10,
                y: 10,
                terrain: "LAND",
                ownerId: "me",
                observatory: { ownerId: "me", status: "active" }
              }
            ],
            [
              "35,10",
              {
                x: 35,
                y: 10,
                terrain: "LAND",
                resource: "TITANIUM"
              }
            ]
          ])
        },
        { x: 35, y: 10, terrain: "LAND", resource: "TITANIUM" }
      )
    ).toBe(true);
  });
});

describe("hasAdjacentSeaEightWay", () => {
  // Worldgen flips every sea tile orthogonally adjacent to land into LAND,
  // so real coastal tiles only ever border open sea diagonally -- the
  // Aether Bridge's coastal-land check must look at all 8 neighbors.
  const terrainAt = (grid: Record<string, Tile["terrain"]>) => (x: number, y: number): Tile["terrain"] => grid[`${x},${y}`] ?? "LAND";

  it("finds sea that is only diagonally adjacent", () => {
    expect(hasAdjacentSeaEightWay(5, 5, terrainAt({ "6,6": "SEA" }))).toBe(true);
  });

  it("returns false when no neighbor is sea", () => {
    expect(hasAdjacentSeaEightWay(5, 5, terrainAt({}))).toBe(false);
  });
});

describe("ownedActiveOrBuildingObservatoryCount / observatoryTileRank", () => {
  const stateWithObservatories = (observatories: Array<Partial<Tile>>): { tiles: Map<string, Tile>; me: string } => {
    const state = createInitialState();
    state.me = "me";
    observatories.forEach((overrides, i) => {
      const tile: Tile = { x: i, y: 0, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", ...overrides };
      state.tiles.set(`${tile.x},${tile.y}`, tile);
    });
    return state;
  };

  it("does not count an inactive Observatory or a Watchtower Engine's own observatory", () => {
    const state = stateWithObservatories([
      { observatory: { ownerId: "me", status: "active" } },
      { observatory: { ownerId: "me", status: "inactive" } },
      { observatory: { ownerId: "me", status: "active" }, naturalWonder: { type: "WATCHTOWER_ENGINE" } }
    ]);
    expect(ownedActiveOrBuildingObservatoryCount(state)).toBe(1);
  });

  it("ranks tiles in a stable order so later Observatories report a higher rank", () => {
    const state = stateWithObservatories([
      { observatory: { ownerId: "me", status: "active" } },
      { observatory: { ownerId: "me", status: "active" } }
    ]);
    const firstTile = state.tiles.get("0,0")!;
    const secondTile = state.tiles.get("1,0")!;
    expect(observatoryTileRank(state, firstTile)).toBe(1);
    expect(observatoryTileRank(state, secondTile)).toBe(2);
  });
});
