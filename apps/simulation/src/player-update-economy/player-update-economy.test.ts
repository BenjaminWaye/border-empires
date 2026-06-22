import { describe, expect, it } from "vitest";

import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";

import { buildPlayerUpdateEconomySnapshot, hasSupportedStructure, refreshTownEconomyFields, supportSummaryForTown } from "./player-update-economy.js";
import { createEmptyPlayerRuntimeSummary, applyTileToPlayerSummary, type PlayerRuntimeSummary } from "../player-runtime-summary.js";

const makePlayer = (): DomainPlayer => ({
  id: "player-1",
  isAi: false,
  points: 0,
  manpower: 0,
  techIds: new Set<string>(),
  allies: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  strategicResources: { FOOD: 10 }
});

const summaryForTiles = (tiles: ReadonlyMap<string, DomainTileState>) => {
  const summary = createEmptyPlayerRuntimeSummary();
  for (const [tileKey, tile] of tiles) applyTileToPlayerSummary(summary, tileKey, tile);
  return summary;
};

describe("buildPlayerUpdateEconomySnapshot", () => {
  it("assigns a shared support tile to one town for support and structure effects", () => {
    const player = makePlayer();
    const westTown: DomainTileState = {
      x: 10,
      y: 10,
      terrain: "LAND",
      ownerId: player.id,
      ownershipState: "SETTLED",
      town: { type: "MARKET", populationTier: "TOWN", name: "West" }
    };
    const eastTown: DomainTileState = {
      x: 12,
      y: 10,
      terrain: "LAND",
      ownerId: player.id,
      ownershipState: "SETTLED",
      town: { type: "MARKET", populationTier: "TOWN", name: "East" }
    };
    const sharedSupport: DomainTileState = {
      x: 11,
      y: 10,
      terrain: "LAND",
      ownerId: player.id,
      ownershipState: "SETTLED",
      economicStructure: { ownerId: player.id, type: "MARKET", status: "active" }
    };
    const tiles = new Map<string, DomainTileState>([
      ["10,10", westTown],
      ["11,10", sharedSupport],
      ["12,10", eastTown]
    ]);

    expect(supportSummaryForTown(player.id, westTown, tiles)).toEqual({ supportCurrent: 1, supportMax: 1 });
    expect(supportSummaryForTown(player.id, eastTown, tiles)).toEqual({ supportCurrent: 0, supportMax: 0 });
    expect(hasSupportedStructure(player.id, westTown, "MARKET", tiles)).toBe(true);
    expect(hasSupportedStructure(player.id, eastTown, "MARKET", tiles)).toBe(false);
  });

  it("adds connected dock route income when both dock endpoints are settled by the player", () => {
    const player = makePlayer();
    const tiles = new Map<string, DomainTileState>([
      ["10,10", { x: 10, y: 10, terrain: "LAND", ownerId: player.id, ownershipState: "SETTLED", dockId: "dock-a" }],
      ["50,50", { x: 50, y: 50, terrain: "LAND", ownerId: player.id, ownershipState: "SETTLED", dockId: "dock-b" }]
    ]);

    const economy = buildPlayerUpdateEconomySnapshot(player, summaryForTiles(tiles), tiles, {
      dockLinksByDockTileKey: new Map([
        ["10,10", ["50,50"]],
        ["50,50", ["10,10"]]
      ])
    });

    expect(economy.incomePerMinute).toBe(1.5);
    expect(economy.economyBreakdown.GOLD.sources).toContainEqual(
      expect.objectContaining({ label: "Docks", amountPerMinute: 1.5, count: 2 })
    );
  });

  it("derives connected town bonus when the rewrite town state has no stored bonus", () => {
    const player = makePlayer();
    const tiles = new Map<string, DomainTileState>([
      [
        "10,10",
        {
          x: 10,
          y: 10,
          terrain: "LAND",
          ownerId: player.id,
          ownershipState: "SETTLED",
          town: { type: "FARMING", populationTier: "TOWN", name: "One" }
        }
      ],
      [
        "11,10",
        {
          x: 11,
          y: 10,
          terrain: "LAND",
          ownerId: player.id,
          ownershipState: "SETTLED",
          town: { type: "MARKET", populationTier: "TOWN", name: "Two" }
        }
      ]
    ]);

    const economy = buildPlayerUpdateEconomySnapshot(player, summaryForTiles(tiles), tiles);

    expect(economy.incomePerMinute).toBe(6);
    expect(economy.economyBreakdown.GOLD.sources).toContainEqual(
      expect.objectContaining({ label: "Towns", amountPerMinute: 6, count: 2 })
    );
  });

  it("folds the Clockwork Stipend trickle into the matching strategic-resource source bucket", () => {
    // Regression: the trickle was applied directly to player.strategicResources
    // each tick but never appeared in strategicProductionPerMinute or the
    // economyBreakdown sources, so players who picked SUPPLY (or IRON/CRYSTAL)
    // saw their stockpile climb but no income line explaining where it came
    // from.
    const player = makePlayer();
    player.domainIds = new Set<string>(["clockwork-stipend"]);
    player.chosenTrickleResource = "SUPPLY";
    const tiles = new Map<string, DomainTileState>([
      ["10,10", { x: 10, y: 10, terrain: "LAND", ownerId: player.id, ownershipState: "SETTLED" }]
    ]);

    const economy = buildPlayerUpdateEconomySnapshot(player, summaryForTiles(tiles), tiles);

    expect(economy.strategicProductionPerMinute.SUPPLY).toBeCloseTo(0.2);
    expect(economy.economyBreakdown.SUPPLY.sources).toContainEqual(
      expect.objectContaining({ label: "Clockwork Stipend", amountPerMinute: 0.2 })
    );
    expect(economy.economyBreakdown.IRON.sources).not.toContainEqual(
      expect.objectContaining({ label: "Clockwork Stipend" })
    );
  });

  it("applies first-three-town gold output domains only to the first three settled towns by ownership order", () => {
    const player = makePlayer();
    player.techIds.add("trade");
    player.domainIds = new Set<string>(["mercantile-charter"]);
    const tiles = new Map<string, DomainTileState>();
    for (const [x, name, populationTier] of [
      [10, "One"],
      [20, "Two"],
      [30, "Three"],
      [0, "Four", "METROPOLIS"]
    ] as const) {
      const tile: DomainTileState = {
        x,
        y: 10,
        terrain: "LAND",
        ownerId: player.id,
        ownershipState: "SETTLED",
        town: { type: "FARMING", populationTier: populationTier ?? "TOWN", name }
      };
      tiles.set(`${x},10`, tile);
    }
    const summary: PlayerRuntimeSummary = {
      ...createEmptyPlayerRuntimeSummary(),
      territoryTileKeys: new Set(["0,10", "10,10", "20,10", "30,10"]),
      settledTileCount: 4,
      townCount: 4,
      ownedTownTierByTile: new Map([
        ["10,10", "TOWN"],
        ["20,10", "TOWN"],
        ["30,10", "TOWN"],
        ["0,10", "METROPOLIS"]
      ])
    };

    const economy = buildPlayerUpdateEconomySnapshot(player, summary, tiles);

    expect(economy.incomePerMinute).toBeCloseTo(15.4);
    expect(economy.economyBreakdown.GOLD.sources).toContainEqual(
      expect.objectContaining({ label: "Towns", amountPerMinute: 15.4, count: 4 })
    );
  });
});

describe("refreshTownEconomyFields", () => {
  it("re-stamps isFed from the freshly computed fed-key set so wire townJson cannot lie about fed state", () => {
    const player = makePlayer();
    const tile: DomainTileState = {
      x: 10,
      y: 10,
      terrain: "LAND",
      ownerId: player.id,
      ownershipState: "SETTLED",
      town: {
        type: "FARMING",
        populationTier: "TOWN",
        supportCurrent: 5,
        supportMax: 5,
        // Stale isFed:true — must be overwritten when fedTownKeys says otherwise.
        isFed: true,
        baseGoldPerMinute: 2,
        population: 1000,
        maxPopulation: 25_000,
        connectedTownCount: 0,
        connectedTownBonus: 0,
        hasMarket: false,
        marketActive: false,
        hasGranary: false,
        granaryActive: false,
        hasBank: false,
        bankActive: false
      }
    };
    const tiles = new Map<string, DomainTileState>([["10,10", tile]]);
    const fedTownKeys = new Set<string>(); // tile is NOT fed in the fresh computation

    const refreshed = refreshTownEconomyFields(tile.town!, tile, player, tiles, fedTownKeys);

    expect(refreshed.isFed).toBe(false);
    expect(refreshed.goldPerMinute).toBe(0);
  });

  it("keeps isFed=true when the tile is in the fresh fed-key set", () => {
    const player = makePlayer();
    const tile: DomainTileState = {
      x: 10,
      y: 10,
      terrain: "LAND",
      ownerId: player.id,
      ownershipState: "SETTLED",
      town: {
        type: "FARMING",
        populationTier: "TOWN",
        supportCurrent: 5,
        supportMax: 5,
        isFed: false, // stale false — should flip to true after restamp
        baseGoldPerMinute: 2,
        population: 1000,
        maxPopulation: 25_000,
        connectedTownCount: 0,
        connectedTownBonus: 0,
        hasMarket: false,
        marketActive: false,
        hasGranary: false,
        granaryActive: false,
        hasBank: false,
        bankActive: false
      }
    };
    const tiles = new Map<string, DomainTileState>([["10,10", tile]]);
    const fedTownKeys = new Set<string>(["10,10"]);

    const refreshed = refreshTownEconomyFields(tile.town!, tile, player, tiles, fedTownKeys);

    expect(refreshed.isFed).toBe(true);
    expect(refreshed.goldPerMinute).toBeGreaterThan(0);
  });

  it("treats settlements as always fed regardless of fedTownKeys membership", () => {
    const player = makePlayer();
    const tile: DomainTileState = {
      x: 10,
      y: 10,
      terrain: "LAND",
      ownerId: player.id,
      ownershipState: "SETTLED",
      town: {
        type: "FARMING",
        populationTier: "SETTLEMENT",
        supportCurrent: 0,
        supportMax: 0,
        isFed: false,
        baseGoldPerMinute: 1,
        population: 500,
        maxPopulation: 2500,
        connectedTownCount: 0,
        connectedTownBonus: 0,
        hasMarket: false,
        marketActive: false,
        hasGranary: false,
        granaryActive: false,
        hasBank: false,
        bankActive: false
      }
    };
    const tiles = new Map<string, DomainTileState>([["10,10", tile]]);
    const fedTownKeys = new Set<string>(); // empty — settlement still fed

    const refreshed = refreshTownEconomyFields(tile.town!, tile, player, tiles, fedTownKeys);

    expect(refreshed.isFed).toBe(true);
  });
});

describe("buildPlayerUpdateEconomySnapshot — integrityEconMult", () => {
  const makeSettledTownTile = (x: number, y: number): DomainTileState => ({
    x,
    y,
    terrain: "LAND",
    ownerId: "player-1",
    ownershipState: "SETTLED",
    town: { type: "FARMING", populationTier: "TOWN", name: `Town${x}` }
  });

  const player = makePlayer();

  it("default mult=1 produces identical output to explicit mult=1 (parity)", () => {
    const tiles = new Map<string, DomainTileState>([["10,10", makeSettledTownTile(10, 10)]]);
    const summary = summaryForTiles(tiles);
    const base = buildPlayerUpdateEconomySnapshot(player, summary, tiles);
    const explicit = buildPlayerUpdateEconomySnapshot(player, summary, tiles, undefined, 1);
    expect(base.incomePerMinute).toBe(explicit.incomePerMinute);
    expect(base.strategicProductionPerMinute).toEqual(explicit.strategicProductionPerMinute);
  });

  it("high mult scales up incomePerMinute", () => {
    const tiles = new Map<string, DomainTileState>([["10,10", makeSettledTownTile(10, 10)]]);
    const summary = summaryForTiles(tiles);
    const base = buildPlayerUpdateEconomySnapshot(player, summary, tiles, undefined, 1);
    const boosted = buildPlayerUpdateEconomySnapshot(player, summary, tiles, undefined, 1.25);
    expect(boosted.incomePerMinute).toBeGreaterThan(base.incomePerMinute);
  });

  it("high mult scales up strategicProductionPerMinute values", () => {
    const ironTile: DomainTileState = {
      x: 11, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "IRON"
    };
    const tiles = new Map<string, DomainTileState>([
      ["10,10", makeSettledTownTile(10, 10)],
      ["11,10", ironTile]
    ]);
    const summary = summaryForTiles(tiles);
    const base = buildPlayerUpdateEconomySnapshot(player, summary, tiles, undefined, 1);
    const boosted = buildPlayerUpdateEconomySnapshot(player, summary, tiles, undefined, 1.25);
    expect(boosted.strategicProductionPerMinute.IRON).toBeGreaterThan(base.strategicProductionPerMinute.IRON);
  });

  it("low mult (< 1) reduces incomePerMinute", () => {
    const tiles = new Map<string, DomainTileState>([["10,10", makeSettledTownTile(10, 10)]]);
    const summary = summaryForTiles(tiles);
    const base = buildPlayerUpdateEconomySnapshot(player, summary, tiles, undefined, 1);
    const reduced = buildPlayerUpdateEconomySnapshot(player, summary, tiles, undefined, 0.8);
    expect(reduced.incomePerMinute).toBeLessThan(base.incomePerMinute);
  });
});
