import { describe, expect, it } from "vitest";
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { refreshTownEconomyFields, townGoldPerMinuteForPlayer } from "./player-update-economy.js";

const player: DomainPlayer = {
  id: "player-1",
  isAi: false,
  points: 0,
  manpower: 0,
  techIds: new Set<string>(),
  allies: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  strategicResources: { FOOD: 10 }
};

describe("townGoldPerMinuteForPlayer — legacy terrain profiles", () => {
  it("restores a pre-profile coastal desert town from its mechanical biome", () => {
    const town: DomainTileState = {
      x: 10,
      y: 10,
      terrain: "LAND",
      landBiome: "COASTAL_SAND",
      ownerId: player.id,
      ownershipState: "SETTLED",
      town: { type: "MARKET", populationTier: "TOWN", name: "Brasshaven" }
    };

    const income = townGoldPerMinuteForPlayer(player, town, town.town!, new Map([["10,10", town]]), new Set(["10,10"]));

    expect(income).toBeCloseTo((2 / 288) * 1.75, 6);
  });

  it("persists the recovered profile and multiplier for a legacy settlement", () => {
    const settlement: DomainTileState = {
      x: 12,
      y: 10,
      terrain: "LAND",
      landBiome: "SAND",
      ownerId: player.id,
      ownershipState: "SETTLED",
      town: {
        type: "MARKET",
        populationTier: "SETTLEMENT",
        supportCurrent: 0,
        supportMax: 0,
        goldPerMinute: 2 / 288,
        isFed: true
      }
    };

    const refreshed = refreshTownEconomyFields(settlement.town!, settlement, player, new Map([["12,10", settlement]]), new Set());

    expect(refreshed.terrainProfile).toBe("DESERT");
    expect(refreshed.goldPerMinute).toBeCloseTo((2 / 288) * 1.6, 6);
  });
});
