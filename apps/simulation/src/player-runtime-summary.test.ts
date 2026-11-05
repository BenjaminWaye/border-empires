import { describe, expect, it } from "vitest";

import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";

import { applyTileToPlayerSummary, createEmptyPlayerRuntimeSummary, estimateIncomePerMinuteFromTiles } from "./player-runtime-summary.js";
import { buildPlayerUpdateEconomySnapshot } from "./player-update-economy/player-update-economy.js";

const PLAYER_ID = "ai-1";

const player: DomainPlayer = {
  id: PLAYER_ID,
  isAi: true,
  points: 0,
  manpower: 0,
  techIds: new Set<string>(),
  allies: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  strategicResources: { FOOD: 10 }
};

const settlement: DomainTileState = {
  x: 10,
  y: 10,
  terrain: "LAND",
  ownerId: PLAYER_ID,
  ownershipState: "SETTLED",
  town: { type: "MARKET", populationTier: "SETTLEMENT", name: "Hold" }
};

describe("player runtime summary gold estimate", () => {
  // Staging regression: the estimate kept the pre-rescale per-tier rates, so
  // AI planner views (and /admin/players) read ~28 gold/min while players
  // actually earned ~0.1/min, which zeroed the AI's GOLD need.
  it("matches the authoritative economy for a lone settlement", () => {
    const tiles = new Map<string, DomainTileState>([["10,10", settlement]]);
    const summary = createEmptyPlayerRuntimeSummary();
    applyTileToPlayerSummary(summary, "10,10", settlement);
    const authoritative = buildPlayerUpdateEconomySnapshot(player, summary, tiles).incomePerMinute;

    expect(authoritative).toBeGreaterThan(0);
    expect(summary.goldIncomePerMinute).toBeCloseTo(authoritative, 6);
    expect(estimateIncomePerMinuteFromTiles(PLAYER_ID, tiles.values())).toBeCloseTo(authoritative, 6);
  });
});
