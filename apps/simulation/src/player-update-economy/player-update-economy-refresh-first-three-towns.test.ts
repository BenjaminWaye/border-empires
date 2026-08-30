import { describe, expect, it } from "vitest";

import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";

import { refreshTownEconomyFields } from "./player-update-economy.js";

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

// Regression: refreshTownEconomyFields is the "between full rebuilds" hot
// path (see its own doc comment) — it already folded Mercantile Charter's
// firstThreeTownsGoldOutputMult/firstThreeTownsPopulationGrowthMult into
// the recomputed goldPerMinute, but never re-stamped the wire fields
// themselves (firstThreeTownGoldMult/firstThreeTownPopGrowthMult) that the
// tile overview's modifier list reads. A town whose original buildTownSummary
// predated the player picking up the domain kept showing no bonus forever,
// since this hot path never re-derives those two fields on its own. Split
// out of player-update-economy.test.ts to keep that file under the repo's
// 500-line cap.
describe("refreshTownEconomyFields — first-three-towns (Mercantile Charter)", () => {
  it("re-stamps firstThreeTownGoldMult/firstThreeTownPopGrowthMult when the town is one of the owner's first three and they hold Mercantile Charter", () => {
    const player: DomainPlayer = { ...makePlayer(), domainIds: new Set(["mercantile-charter"]) };
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
        isFed: true,
        baseGoldPerMinute: 2,
        population: 1000,
        maxPopulation: 25_000,
        connectedTownCount: 0,
        connectedTownBonus: 0,
        hasMintworks: false,
        mintworksActive: false,
        hasGranary: false,
        granaryActive: false
      }
    };
    const tiles = new Map<string, DomainTileState>([["10,10", tile]]);
    const fedTownKeys = new Set<string>(["10,10"]);
    const firstThreeTownKeys = new Set<string>(["10,10"]);

    const refreshed = refreshTownEconomyFields(tile.town!, tile, player, tiles, fedTownKeys, firstThreeTownKeys);

    expect(refreshed.firstThreeTownGoldMult).toBeCloseTo(1.5, 5);
    expect(refreshed.firstThreeTownPopGrowthMult).toBeCloseTo(1.25, 5);
  });

  it("clears a stale firstThreeTownGoldMult/firstThreeTownPopGrowthMult when the town is no longer one of the owner's first three", () => {
    const player: DomainPlayer = { ...makePlayer(), domainIds: new Set(["mercantile-charter"]) };
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
        isFed: true,
        baseGoldPerMinute: 2,
        population: 1000,
        maxPopulation: 25_000,
        connectedTownCount: 0,
        connectedTownBonus: 0,
        hasMintworks: false,
        mintworksActive: false,
        hasGranary: false,
        granaryActive: false,
        // Stale from a prior full rebuild while this town was still first-three.
        firstThreeTownGoldMult: 1.5,
        firstThreeTownPopGrowthMult: 1.25
      }
    };
    const tiles = new Map<string, DomainTileState>([["10,10", tile]]);
    const fedTownKeys = new Set<string>(["10,10"]);
    const firstThreeTownKeys = new Set<string>(); // no longer first-three

    const refreshed = refreshTownEconomyFields(tile.town!, tile, player, tiles, fedTownKeys, firstThreeTownKeys);

    expect(refreshed.firstThreeTownGoldMult).toBeUndefined();
    expect(refreshed.firstThreeTownPopGrowthMult).toBeUndefined();
  });
});
