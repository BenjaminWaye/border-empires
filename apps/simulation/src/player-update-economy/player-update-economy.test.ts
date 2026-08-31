import { describe, expect, it } from "vitest";

import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { MINTWORKS_FLAT_GOLD_BONUS_PER_MIN, mintworksGoldProductionMultiplier } from "@border-empires/game-domain";

import { buildPlayerUpdateEconomySnapshot, hasSupportedStructure, refreshTownEconomyFields, supportSummaryForTown, townGoldPerMinuteForPlayer } from "./player-update-economy.js";
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
      economicStructure: { ownerId: player.id, type: "MINTWORKS", status: "active" }
    };
    const tiles = new Map<string, DomainTileState>([
      ["10,10", westTown],
      ["11,10", sharedSupport],
      ["12,10", eastTown]
    ]);

    expect(supportSummaryForTown(player.id, westTown, tiles)).toEqual({ supportCurrent: 1, supportMax: 1 });
    expect(supportSummaryForTown(player.id, eastTown, tiles)).toEqual({ supportCurrent: 0, supportMax: 0 });
    expect(hasSupportedStructure(player.id, westTown, "MINTWORKS", tiles)).toBe(true);
    expect(hasSupportedStructure(player.id, eastTown, "MINTWORKS", tiles)).toBe(false);
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

    // 1.5 was the pre-gold-rescope figure; DOCK_INCOME_PER_MIN is now cut
    // 288x (docs/manpower-economy-rewrite-plan.md §6.1), with each dock's
    // contribution rounded to 6dp as it's accumulated into the bucket.
    expect(economy.incomePerMinute).toBe(0.005208);
    expect(economy.economyBreakdown.GOLD.sources).toContainEqual(
      expect.objectContaining({ label: "Docks", amountPerMinute: 0.005208, count: 2 })
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
      ],
      [
        "10,9",
        {
          x: 10,
          y: 9,
          terrain: "LAND",
          ownerId: player.id,
          ownershipState: "SETTLED",
          economicStructure: { ownerId: player.id, type: "CARAVANARY", status: "active" }
        }
      ]
    ]);

    const economy = buildPlayerUpdateEconomySnapshot(player, summaryForTiles(tiles), tiles);

    // 6 was the pre-gold-rescope figure; TOWN_BASE_GOLD_PER_MIN is now cut
    // 288x (docs/manpower-economy-rewrite-plan.md §6.1).
    expect(economy.incomePerMinute).toBe(0.020834);
    expect(economy.economyBreakdown.GOLD.sources).toContainEqual(
      expect.objectContaining({ label: "Towns", amountPerMinute: 0.020834, count: 2 })
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

    // 15.4 was the pre-gold-rescope figure; town/settlement base gold
    // income is now cut 288x (docs/manpower-economy-rewrite-plan.md §6.1).
    expect(economy.incomePerMinute).toBeCloseTo(15.4 / 288, 5);
    expect(economy.economyBreakdown.GOLD.sources).toContainEqual(
      expect.objectContaining({ label: "Towns", amountPerMinute: expect.closeTo(15.4 / 288, 5), count: 4 })
    );
  });

  it("an active Farmstead on a FARM tile adds no strategicProductionPerMinute.FOOD (slot-based, not yield-based)", () => {
    // FOOD joined TITANIUM/CRYSTAL/UMBRITE as slot-based (§5.4) — a Farmstead's
    // real effect now is boosting FOOD *slot supply* (structure-slots.ts),
    // a separate mechanism this snapshot doesn't compute.
    const player = makePlayer();
    const farmTile: DomainTileState = {
      x: 10,
      y: 10,
      terrain: "LAND",
      ownerId: player.id,
      ownershipState: "SETTLED",
      resource: "FARM",
      economicStructure: { ownerId: player.id, type: "FARMSTEAD", status: "active" }
    };
    const tiles = new Map<string, DomainTileState>([["10,10", farmTile]]);

    const withFarmstead = buildPlayerUpdateEconomySnapshot(player, summaryForTiles(tiles), tiles);

    expect(withFarmstead.strategicProductionPerMinute.FOOD).toBe(0);
    expect(withFarmstead.economyBreakdown.FOOD.sources).not.toContainEqual(
      expect.objectContaining({ label: "Farmstead", resourceKey: "FOOD" })
    );
  });

  it("regression: Farmstead gives no food bonus on FISH tiles", () => {
    const player = makePlayer();
    const fishTile: DomainTileState = {
      x: 10,
      y: 10,
      terrain: "LAND",
      ownerId: player.id,
      ownershipState: "SETTLED",
      resource: "FISH",
      economicStructure: { ownerId: player.id, type: "FARMSTEAD", status: "active" }
    };
    const tiles = new Map<string, DomainTileState>([["10,10", fishTile]]);

    const economy = buildPlayerUpdateEconomySnapshot(player, summaryForTiles(tiles), tiles);

    expect(economy.economyBreakdown.FOOD.sources).not.toContainEqual(
      expect.objectContaining({ label: "Farmstead" })
    );
  });

  it("goldCapIncomePerMinute equals incomePerMinute when no cap-mult techs are active", () => {
    const player = makePlayer();
    const tiles = new Map<string, DomainTileState>([
      ["10,10", { x: 10, y: 10, terrain: "LAND", ownerId: player.id, ownershipState: "SETTLED", dockId: "dock-a" }],
      ["20,10", { x: 20, y: 10, terrain: "LAND", ownerId: player.id, ownershipState: "SETTLED", town: { type: "MARKET", populationTier: "TOWN", name: "T" } }]
    ]);
    const economy = buildPlayerUpdateEconomySnapshot(player, summaryForTiles(tiles), tiles);
    // toBeCloseTo, not toBe: incomePerMinute and goldCapIncomePerMinute are
    // independently accumulated (separate bucket chains), so even at 6dp
    // rounding (bumped from 4dp for the gold rescope, §6.1 — see addBucket's
    // comment) they can land a unit apart in the last decimal despite being
    // mathematically identical with no cap multiplier active. This was
    // already true pre-rescale; it just wasn't visible until gold's new,
    // much smaller magnitude made the relative rounding noise non-trivial.
    expect(economy.goldCapIncomePerMinute).toBeCloseTo(economy.incomePerMinute, 4);
  });

  // Removed: this test boosted "port-infrastructure" for its dockGoldCapMult:
  // 1.25 effect. The 2026 tech-tree redesign cut port-infrastructure (it was
  // a bonus-only tech with no building/ability attached, contrary to the
  // redesign's "no flat bonus techs" rule) and did not carry dockGoldCapMult
  // forward onto any surviving tech — grepping tech-tree.json confirms the
  // effect key no longer exists anywhere. Flagging for product awareness: if
  // a dock-gold-cap-multiplier tech is still meant to exist, it needs a new
  // home, not a test workaround.

  it("townGoldCapMult does not apply to settlement income", () => {
    const base = makePlayer();
    const boosted = makePlayer();
    boosted.techIds.add("ledger-keeping"); // townGoldCapMult: 1.05
    const tiles = new Map<string, DomainTileState>([
      ["10,10", { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { type: "FARMING", populationTier: "SETTLEMENT", name: "S" } }]
    ]);
    const baseEconomy = buildPlayerUpdateEconomySnapshot(base, summaryForTiles(tiles), tiles);
    const boostedEconomy = buildPlayerUpdateEconomySnapshot(boosted, summaryForTiles(tiles), tiles);
    expect(boostedEconomy.goldCapIncomePerMinute).toBe(baseEconomy.goldCapIncomePerMinute);
  });
});

describe("townGoldPerMinuteForPlayer — mintworks stacking", () => {
  // mintworks-stacking task: each active Mintworks in a town's support ring
  // contributes its own +10% (additive), not a single flat +10%/+35% for
  // "any Mintworks present." Builds a town tile with N Mintworks filling its
  // 8-tile support ring (plus enough remaining ring tiles settled to keep
  // supportRatio at 1, isolating the assertion to the mintworks multiplier).
  const buildTownWithMintworks = (mintworksCount: number) => {
    const player = makePlayer();
    const townTile: DomainTileState = {
      x: 10,
      y: 10,
      terrain: "LAND",
      ownerId: player.id,
      ownershipState: "SETTLED",
      town: { type: "MARKET", populationTier: "TOWN", name: "Stackville" }
    };
    const ringOffsets = [
      [-1, -1], [0, -1], [1, -1],
      [-1, 0], [1, 0],
      [-1, 1], [0, 1], [1, 1]
    ];
    const tiles = new Map<string, DomainTileState>([["10,10", townTile]]);
    ringOffsets.forEach(([dx, dy], i) => {
      const x = 10 + dx!;
      const y = 10 + dy!;
      const isMintworks = i < mintworksCount;
      tiles.set(`${x},${y}`, {
        x, y, terrain: "LAND", ownerId: player.id, ownershipState: "SETTLED",
        ...(isMintworks ? { economicStructure: { ownerId: player.id, type: "MINTWORKS", status: "active" } } : {})
      });
    });
    const fedTownKeys = new Set(["10,10"]);
    return { player, townTile, tiles, fedTownKeys };
  };

  // Both `buildTownWithMintworks` calls being compared here always keep
  // supportMax/supportRatio at 8/8 (every ring tile is settled regardless of
  // whether it holds a Mintworks), so the only thing that differs between them
  // is mintworksCount — isolating the assertion to the additive per-mintworks
  // stacking rather than a support-ratio side effect.
  const expectedGoldPerMinute = (baseWithNoMintworks: number, mintworksCount: number, clearingHouseActive = false): number =>
    baseWithNoMintworks * mintworksGoldProductionMultiplier(mintworksCount, clearingHouseActive) + MINTWORKS_FLAT_GOLD_BONUS_PER_MIN * mintworksCount;

  it("1 active Mintworks grants +10% town gold production (baseline, must not regress)", () => {
    const { player, townTile, tiles: noMintworksTiles, fedTownKeys: noMintworksFed } = buildTownWithMintworks(0);
    const baseWithNoMintworks = townGoldPerMinuteForPlayer(player, townTile, townTile.town!, noMintworksTiles, noMintworksFed);
    const { tiles, fedTownKeys } = buildTownWithMintworks(1);
    const withOneMintworks = townGoldPerMinuteForPlayer(player, townTile, townTile.town!, tiles, fedTownKeys);
    expect(withOneMintworks).toBeCloseTo(expectedGoldPerMinute(baseWithNoMintworks, 1), 6);
  });

  it("5 active Mintworks in the support ring grant +50% town gold production, not +10% and not capped", () => {
    const { player, townTile, tiles: noMintworksTiles, fedTownKeys: noMintworksFed } = buildTownWithMintworks(0);
    const baseWithNoMintworks = townGoldPerMinuteForPlayer(player, townTile, townTile.town!, noMintworksTiles, noMintworksFed);
    const { tiles, fedTownKeys } = buildTownWithMintworks(5);
    const withFiveMintworks = townGoldPerMinuteForPlayer(player, townTile, townTile.town!, tiles, fedTownKeys);
    expect(withFiveMintworks).toBeCloseTo(expectedGoldPerMinute(baseWithNoMintworks, 5), 6);
    // Explicitly rule out the old non-stacking behavior (flat +10% no
    // matter how many Mintworks) regressing back in.
    const oldNonStackingBehavior = expectedGoldPerMinute(baseWithNoMintworks, 1);
    expect(withFiveMintworks).toBeGreaterThan(oldNonStackingBehavior);
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
        hasMintworks: false,
        mintworksActive: false,
        hasGranary: false,
        granaryActive: false,
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
        hasMintworks: false,
        mintworksActive: false,
        hasGranary: false,
        granaryActive: false,
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
        hasMintworks: false,
        mintworksActive: false,
        hasGranary: false,
        granaryActive: false,
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

  it("mult has nothing left to scale in strategicProductionPerMinute.FOOD (slot-based, not yield-based)", () => {
    // FOOD joined TITANIUM/CRYSTAL/UMBRITE as slot-based (§5.4) — a bare FARM tile
    // no longer produces a mult-scalable FOOD rate at all.
    const farmTile: DomainTileState = {
      x: 11, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM"
    };
    const tiles = new Map<string, DomainTileState>([
      ["10,10", makeSettledTownTile(10, 10)],
      ["11,10", farmTile]
    ]);
    const summary = summaryForTiles(tiles);
    const base = buildPlayerUpdateEconomySnapshot(player, summary, tiles, undefined, 1);
    const boosted = buildPlayerUpdateEconomySnapshot(player, summary, tiles, undefined, 1.25);
    expect(boosted.strategicProductionPerMinute.FOOD).toBe(0);
    expect(base.strategicProductionPerMinute.FOOD).toBe(0);
  });

  it("low mult (< 1) reduces incomePerMinute", () => {
    const tiles = new Map<string, DomainTileState>([["10,10", makeSettledTownTile(10, 10)]]);
    const summary = summaryForTiles(tiles);
    const base = buildPlayerUpdateEconomySnapshot(player, summary, tiles, undefined, 1);
    const reduced = buildPlayerUpdateEconomySnapshot(player, summary, tiles, undefined, 0.8);
    expect(reduced.incomePerMinute).toBeLessThan(base.incomePerMinute);
  });
});

// Converter mode-flip economy tests live in
// player-update-economy-converter-mode.test.ts (500-line budget extraction).
