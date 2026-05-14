import { describe, expect, it } from "vitest";

import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";

import { buildPlayerUpdateEconomySnapshot } from "./player-update-economy.js";
import { createEmptyPlayerRuntimeSummary, applyTileToPlayerSummary, type PlayerRuntimeSummary } from "./player-runtime-summary.js";

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
