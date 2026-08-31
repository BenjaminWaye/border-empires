import { describe, expect, it } from "vitest";

import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";

import { buildPlayerUpdateEconomySnapshot } from "./player-update-economy.js";
import { createEmptyPlayerRuntimeSummary, applyTileToPlayerSummary } from "../player-runtime-summary.js";

// Split out of player-update-economy.test.ts (500-line budget, AGENTS.md) —
// converter-mode-flip plan §Phase 4/8: EXCHANGE-mode gold payout, dormancy
// suppression, no-upkeep, Advanced-tier 1.5x, income-multiplier routing, and
// SYNTHESIZE back-compat.
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

describe("converter mode economy", () => {
  const economyForMode = (mode?: "SYNTHESIZE" | "EXCHANGE", dormant = false) => {
    const player = makePlayer();
    const tile: DomainTileState = {
      x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED",
      economicStructure: { ownerId: "player-1", type: "TITANIUM_WORKS", status: "active", ...(mode ? { converterMode: mode } : {}) }
    };
    const tiles = new Map([["10,10", tile]]);
    return buildPlayerUpdateEconomySnapshot(player, summaryForTiles(tiles), tiles, undefined, 1, undefined, undefined, dormant ? new Set(["10,10"]) : undefined);
  };

  it("an EXCHANGE-mode converter pays out gold for its slot; no upkeep sink", () => {
    const economy = economyForMode("EXCHANGE");
    expect(economy.economyBreakdown.GOLD.sources).toContainEqual(expect.objectContaining({ label: "TITANIUM_WORKS", count: 1 }));
    expect(economy.economyBreakdown.GOLD.sources.find((s) => s.label === "TITANIUM_WORKS")?.amountPerMinute).toBeCloseTo(8 / 1440, 5);
    expect(economy.economyBreakdown.GOLD.sinks).not.toContainEqual(expect.objectContaining({ label: "TITANIUM_WORKS" }));
  });

  it("a dormant EXCHANGE-mode converter pays out no gold", () => {
    expect(economyForMode("EXCHANGE", true).economyBreakdown.GOLD.sources).not.toContainEqual(expect.objectContaining({ label: "TITANIUM_WORKS" }));
  });

  it("absent converterMode behaves as SYNTHESIZE: upkeep sink, no gold payout", () => {
    const economy = economyForMode();
    expect(economy.economyBreakdown.GOLD.sinks).toContainEqual(expect.objectContaining({ label: "TITANIUM_WORKS" }));
    expect(economy.economyBreakdown.GOLD.sources).not.toContainEqual(expect.objectContaining({ label: "TITANIUM_WORKS" }));
  });

  it("an Advanced EXCHANGE-mode converter credits 1.5x the basic-tier payout", () => {
    const player = makePlayer();
    const tile: DomainTileState = {
      x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED",
      economicStructure: { ownerId: "player-1", type: "ADVANCED_TITANIUM_WORKS", status: "active", converterMode: "EXCHANGE" }
    };
    const tiles = new Map([["10,10", tile]]);
    const economy = buildPlayerUpdateEconomySnapshot(player, summaryForTiles(tiles), tiles, undefined, 1, undefined, undefined, undefined);
    expect(economy.economyBreakdown.GOLD.sources.find((s) => s.label === "ADVANCED_TITANIUM_WORKS")?.amountPerMinute).toBeCloseTo(12 / 1440, 5);
  });

  it("EXCHANGE-mode gold payout routes through the player's income multiplier", () => {
    const player = makePlayer();
    player.mods = { attack: 1, defense: 1, vision: 1, ...(player.mods ?? {}), income: 2 };
    const tile: DomainTileState = {
      x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED",
      economicStructure: { ownerId: "player-1", type: "TITANIUM_WORKS", status: "active", converterMode: "EXCHANGE" }
    };
    const tiles = new Map([["10,10", tile]]);
    const economy = buildPlayerUpdateEconomySnapshot(player, summaryForTiles(tiles), tiles, undefined, 1, undefined, undefined, undefined);
    expect(economy.economyBreakdown.GOLD.sources.find((s) => s.label === "TITANIUM_WORKS")?.amountPerMinute).toBeCloseTo((8 * 2) / 1440, 5);
  });

  it("a freshly-captured EXCHANGE-mode converter pays no gold while modeLockedUntil is in the future (capture shock)", () => {
    const player = makePlayer();
    const tile: DomainTileState = {
      x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED",
      economicStructure: {
        ownerId: "player-1", type: "TITANIUM_WORKS", status: "active", converterMode: "EXCHANGE",
        modeLockedUntil: 5_000
      }
    };
    const tiles = new Map([["10,10", tile]]);
    const economy = buildPlayerUpdateEconomySnapshot(
      player, summaryForTiles(tiles), tiles, undefined, 1, undefined, undefined, undefined, 1_000
    );
    expect(economy.economyBreakdown.GOLD.sources).not.toContainEqual(expect.objectContaining({ label: "TITANIUM_WORKS" }));
  });

  it("resumes EXCHANGE-mode payout once modeLockedUntil (capture shock or otherwise) has passed", () => {
    const player = makePlayer();
    const tile: DomainTileState = {
      x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED",
      economicStructure: {
        ownerId: "player-1", type: "TITANIUM_WORKS", status: "active", converterMode: "EXCHANGE",
        modeLockedUntil: 5_000
      }
    };
    const tiles = new Map([["10,10", tile]]);
    const economy = buildPlayerUpdateEconomySnapshot(
      player, summaryForTiles(tiles), tiles, undefined, 1, undefined, undefined, undefined, 5_001
    );
    expect(economy.economyBreakdown.GOLD.sources.find((s) => s.label === "TITANIUM_WORKS")?.amountPerMinute).toBeCloseTo(8 / 1440, 5);
  });

  // Mintworks-style town attribution: an EXCHANGE-mode converter built in a
  // town's support ring pays its gold through that town's own "Towns"
  // bucket instead of a separate standalone bucket (so it shows up in the
  // town's own gold-production number/modifier list, like Mintworks) — and
  // must not be counted twice.
  describe("town-support attribution", () => {
    const townPlusConverterTiles = (): Map<string, DomainTileState> => {
      const town: DomainTileState = {
        x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED",
        town: { type: "MARKET", populationTier: "TOWN", name: "West" }
      };
      const converter: DomainTileState = {
        x: 11, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED",
        economicStructure: { ownerId: "player-1", type: "CRYSTAL_SYNTHESIZER", status: "active", converterMode: "EXCHANGE" }
      };
      return new Map([["10,10", town], ["11,10", converter]]);
    };

    it("folds a support-ring converter's gold into the town's own Towns bucket, not a standalone bucket", () => {
      const player = makePlayer();
      const tiles = townPlusConverterTiles();
      const economy = buildPlayerUpdateEconomySnapshot(player, summaryForTiles(tiles), tiles);
      const converterAmount = 10 / 1440;
      expect(economy.economyBreakdown.GOLD.sources).not.toContainEqual(expect.objectContaining({ label: "CRYSTAL_SYNTHESIZER" }));
      const townsBucket = economy.economyBreakdown.GOLD.sources.find((s) => s.label === "Towns");
      expect(townsBucket?.amountPerMinute).toBeGreaterThanOrEqual(converterAmount);
    });

    it("does not double-count a support-ring converter's gold in total incomePerMinute", () => {
      const player = makePlayer();
      const withConverter = buildPlayerUpdateEconomySnapshot(player, summaryForTiles(townPlusConverterTiles()), townPlusConverterTiles());
      const townOnlyTiles = new Map([["10,10", townPlusConverterTiles().get("10,10")!]]);
      const withoutConverter = buildPlayerUpdateEconomySnapshot(makePlayer(), summaryForTiles(townOnlyTiles), townOnlyTiles);
      const converterAmount = 10 / 1440;
      expect(withConverter.incomePerMinute).toBeCloseTo(withoutConverter.incomePerMinute + converterAmount, 5);
    });

    it("still pays a converter as standalone empire income when it is NOT in any town's support ring", () => {
      const player = makePlayer();
      const town: DomainTileState = {
        x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED",
        town: { type: "MARKET", populationTier: "TOWN", name: "West" }
      };
      const farConverter: DomainTileState = {
        x: 30, y: 30, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED",
        economicStructure: { ownerId: "player-1", type: "CRYSTAL_SYNTHESIZER", status: "active", converterMode: "EXCHANGE" }
      };
      const tiles = new Map([["10,10", town], ["30,30", farConverter]]);
      const economy = buildPlayerUpdateEconomySnapshot(player, summaryForTiles(tiles), tiles);
      expect(economy.economyBreakdown.GOLD.sources).toContainEqual(expect.objectContaining({ label: "CRYSTAL_SYNTHESIZER" }));
    });
  });
});
