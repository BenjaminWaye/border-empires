import { describe, expect, it } from "vitest";
import { settleDurationMsForTile } from "../client-constants.js";
import { settleDurationMsForState, settlementSpeedMultiplierForState } from "../client-queue-logic/client-queue-logic.js";
import { createInitialState } from "../client-state/client-state.js";
import { menuActionsForSingleTile, tileActionAvailabilityWithDevelopmentSlot } from "../client-tile-action-logic/client-tile-action-logic.js";
import { hasAdjacentSeaEightWay, ownedActiveObservatoryWithinRange, shouldOptimisticallyBuildOnSelectedTile, splitTileActionsIntoTabs } from "./client-tile-action-support.js";
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
        id: "build_foundry",
        label: "Build Foundry",
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
      { id: "build_relay_beacon", label: "Build Relay Beacon", detail: " • settles this tile first", disabled: false }
    ];
    expect(splitTileActionsIntoTabs(frontierRelayBeacon, state)).toEqual({
      actions: frontierRelayBeacon,
      buildings: frontierRelayBeacon,
      crystal: []
    });
  });

  it("sorts support-only buildings before general settled buildings", () => {
    const rows: TileActionDef[] = [
      {
        id: "build_foundry",
        label: "Build Foundry",
        disabled: false
      },
      {
        id: "build_mintworks",
        label: "Build Mintworks",
        disabled: false
      },
      {
        id: "build_clearing_house",
        label: "Build Clearing House",
        disabled: false
      }
    ];

    expect(splitTileActionsIntoTabs(rows, state).buildings.map((row) => row.id)).toEqual([
      "build_mintworks",
      "build_clearing_house",
      "build_foundry"
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
        id: "build_foundry",
        label: "Build Foundry",
        disabled: false
      },
      {
        id: "build_mintworks",
        label: "Build Mintworks",
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
      "build_mintworks",
      "build_foundry",
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
      hasMintworks: false,
      mintworksActive: false,
      hasGranary: false,
      granaryActive: false,
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
    expect(shouldOptimisticallyBuildOnSelectedTile("build_granary", townTile)).toBe(false);
    expect(shouldOptimisticallyBuildOnSelectedTile("build_titanium_works", townTile)).toBe(false);
  });

  it("still allows optimistic builds on real support tiles", () => {
    expect(shouldOptimisticallyBuildOnSelectedTile("build_mintworks", supportTile)).toBe(true);
  });

  it("keeps same-tile structures optimistic on town tiles", () => {
    // Mintworks moved to same-tile/uncapped placement in the tech-tree redesign
    // (per-town cap removed), so it's optimistic on the town tile now too,
    // same as Foundry.
    expect(shouldOptimisticallyBuildOnSelectedTile("build_foundry", townTile)).toBe(true);
    expect(shouldOptimisticallyBuildOnSelectedTile("build_mintworks", townTile)).toBe(true);
  });
});

describe("town support tile actions", () => {
  it("uses the first assigned town instead of blocking shared support tiles", () => {
    const clientState = createInitialState();
    clientState.me = "me";
    clientState.gold = 500;
    clientState.techIds = ["trade"];
    // §5 (resource slots): MINTWORKS needs a free FOOD slot at build time now
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
        hasMintworks: false,
        mintworksActive: false,
        hasGranary: false,
        granaryActive: false,
      }
    });

    const actions = menuActionsForSingleTile(clientState, supportTile, {
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
      developmentSlotSummary: () => ({ busy: 0, limit: 3, available: 3 }),
      developmentSlotReason: () => "",
      structureGoldCost: () => 0,
      structureCostText: () => "0 gold",
      supportedOwnedTownsForTile: () => [town(209, 148), town(211, 150)],
      supportedOwnedDocksForTile: () => [],
      townHasSupportStructure: () => false,
      activeTruceWithPlayer: () => undefined,
      pendingTruceWithPlayer: () => undefined,
      ownerSpawnShieldActive: () => false
    } as never);

    expect(actions.find((action) => action.id === "build_mintworks")).toMatchObject({
      disabled: false
    });
    expect(actions.some((action) => action.disabledReason === "Support tile touches multiple towns")).toBe(false);
  });
});

describe("tileActionAvailabilityWithDevelopmentSlot", () => {
  const fullSlots: DevelopmentSlotSummary = { busy: 3, limit: 3, available: 0 };

  it("keeps otherwise-valid builds enabled and marked as queued when development slots are full", () => {
    expect(
      tileActionAvailabilityWithDevelopmentSlot(true, "Build Wooden Fort", "900 gold", fullSlots, {
        developmentSlotReason: () => "No available development slots (3/3 busy)"
      })
    ).toEqual({
      disabled: false,
      cost: "900 gold • queues"
    });
  });

  it("preserves the real blocker instead of blaming full development slots for unavailable builds", () => {
    expect(tileActionAvailabilityWithDevelopmentSlot(false, "Need 900 gold", "900 gold • 8m", fullSlots)).toEqual({
      disabled: true,
      disabledReason: "Need 900 gold",
      cost: "900 gold • 8m"
    });
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
