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
      economicStructure: { ownerId: "player-1", type: "IRONWORKS", status: "active", ...(mode ? { converterMode: mode } : {}) }
    };
    const tiles = new Map([["10,10", tile]]);
    return buildPlayerUpdateEconomySnapshot(player, summaryForTiles(tiles), tiles, undefined, 1, undefined, undefined, dormant ? new Set(["10,10"]) : undefined);
  };

  it("an EXCHANGE-mode converter pays out gold for its slot; no upkeep sink", () => {
    const economy = economyForMode("EXCHANGE");
    expect(economy.economyBreakdown.GOLD.sources).toContainEqual(expect.objectContaining({ label: "IRONWORKS", count: 1 }));
    expect(economy.economyBreakdown.GOLD.sources.find((s) => s.label === "IRONWORKS")?.amountPerMinute).toBeCloseTo(8 / 1440, 5);
    expect(economy.economyBreakdown.GOLD.sinks).not.toContainEqual(expect.objectContaining({ label: "IRONWORKS" }));
  });

  it("a dormant EXCHANGE-mode converter pays out no gold", () => {
    expect(economyForMode("EXCHANGE", true).economyBreakdown.GOLD.sources).not.toContainEqual(expect.objectContaining({ label: "IRONWORKS" }));
  });

  it("absent converterMode behaves as SYNTHESIZE: upkeep sink, no gold payout", () => {
    const economy = economyForMode();
    expect(economy.economyBreakdown.GOLD.sinks).toContainEqual(expect.objectContaining({ label: "IRONWORKS" }));
    expect(economy.economyBreakdown.GOLD.sources).not.toContainEqual(expect.objectContaining({ label: "IRONWORKS" }));
  });

  it("an Advanced EXCHANGE-mode converter credits 1.5x the basic-tier payout", () => {
    const player = makePlayer();
    const tile: DomainTileState = {
      x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED",
      economicStructure: { ownerId: "player-1", type: "ADVANCED_IRONWORKS", status: "active", converterMode: "EXCHANGE" }
    };
    const tiles = new Map([["10,10", tile]]);
    const economy = buildPlayerUpdateEconomySnapshot(player, summaryForTiles(tiles), tiles, undefined, 1, undefined, undefined, undefined);
    expect(economy.economyBreakdown.GOLD.sources.find((s) => s.label === "ADVANCED_IRONWORKS")?.amountPerMinute).toBeCloseTo(12 / 1440, 5);
  });

  it("EXCHANGE-mode gold payout routes through the player's income multiplier", () => {
    const player = makePlayer();
    player.mods = { attack: 1, defense: 1, vision: 1, ...(player.mods ?? {}), income: 2 };
    const tile: DomainTileState = {
      x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED",
      economicStructure: { ownerId: "player-1", type: "IRONWORKS", status: "active", converterMode: "EXCHANGE" }
    };
    const tiles = new Map([["10,10", tile]]);
    const economy = buildPlayerUpdateEconomySnapshot(player, summaryForTiles(tiles), tiles, undefined, 1, undefined, undefined, undefined);
    expect(economy.economyBreakdown.GOLD.sources.find((s) => s.label === "IRONWORKS")?.amountPerMinute).toBeCloseTo((8 * 2) / 1440, 5);
  });

  it("a freshly-captured EXCHANGE-mode converter pays no gold while modeLockedUntil is in the future (capture shock)", () => {
    const player = makePlayer();
    const tile: DomainTileState = {
      x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED",
      economicStructure: {
        ownerId: "player-1", type: "IRONWORKS", status: "active", converterMode: "EXCHANGE",
        modeLockedUntil: 5_000
      }
    };
    const tiles = new Map([["10,10", tile]]);
    const economy = buildPlayerUpdateEconomySnapshot(
      player, summaryForTiles(tiles), tiles, undefined, 1, undefined, undefined, undefined, 1_000
    );
    expect(economy.economyBreakdown.GOLD.sources).not.toContainEqual(expect.objectContaining({ label: "IRONWORKS" }));
  });

  it("resumes EXCHANGE-mode payout once modeLockedUntil (capture shock or otherwise) has passed", () => {
    const player = makePlayer();
    const tile: DomainTileState = {
      x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED",
      economicStructure: {
        ownerId: "player-1", type: "IRONWORKS", status: "active", converterMode: "EXCHANGE",
        modeLockedUntil: 5_000
      }
    };
    const tiles = new Map([["10,10", tile]]);
    const economy = buildPlayerUpdateEconomySnapshot(
      player, summaryForTiles(tiles), tiles, undefined, 1, undefined, undefined, undefined, 5_001
    );
    expect(economy.economyBreakdown.GOLD.sources.find((s) => s.label === "IRONWORKS")?.amountPerMinute).toBeCloseTo(8 / 1440, 5);
  });
});
