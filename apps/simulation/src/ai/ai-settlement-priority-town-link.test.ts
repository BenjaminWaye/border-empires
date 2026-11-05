import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";

import { evaluateSettlementCandidate, TOWN_LINK_VALUE_BONUS } from "./ai-settlement-priority.js";
import { linkValueTownKeys } from "./build/economic-synergy-scoring.js";
import type { TownEconomyEntry } from "./build/town-economy-view.js";

// Phase 5 of docs/ai-economic-synergy-plan.md: EXPAND targets that sit
// between two of the player's towns pull harder when one of those towns
// would earn more from the connection (Trade Nexus in reach, or enough
// Manufactories that one would pay).

const tile = (x: number, y: number, partial: Partial<DomainTileState> = {}): DomainTileState => ({
  x,
  y,
  terrain: "LAND",
  ownerId: "player-1",
  ownershipState: "FRONTIER",
  ...partial
});

const town = (x: number, y: number, name: string): DomainTileState =>
  tile(x, y, { ownershipState: "SETTLED", town: { type: "FARMING", populationTier: "TOWN", name, supportMax: 8, supportCurrent: 8 } });

// Frontier gap at (12,10) with a town two tiles either side.
const tiles = new Map([tile(12, 10), town(10, 10, "West"), town(14, 10, "East"), tile(11, 10), tile(13, 10)].map((t) => [`${t.x},${t.y}`, t]));
const target = tiles.get("12,10")!;

const entry = (townKey: string, overrides: Partial<TownEconomyEntry> = {}): TownEconomyEntry => ({
  townKey,
  baseGoldWeight: 1,
  baseManpowerCap: 300,
  manufactories: 0,
  ancillaryDepots: 0,
  hasAncillaryFactory: false,
  connectedTownCount: 0,
  connectedTownBonus: 0,
  tradeNexusInReach: false,
  clearingHouseInReach: false,
  neuralWorksInReach: false,
  reserveLatticeInReach: false,
  ancillaryFactoriesInReach: 0,
  depotTownsInReach: 0,
  amplifiersUnderConstruction: [],
  ...overrides
});

describe("town-link value in EXPAND scoring", () => {
  it("adds the link bonus between two towns when one gains from connecting", () => {
    const plain = evaluateSettlementCandidate("player-1", target, tiles, new Set(["12,10"]));
    const linked = evaluateSettlementCandidate("player-1", target, tiles, new Set(["12,10"]), new Set(["14,10"]));
    expect(linked.score - plain.score).toBe(TOWN_LINK_VALUE_BONUS);
  });

  it("adds nothing next to a single town", () => {
    const lone = new Map([tile(12, 10), town(14, 10, "East")].map((t) => [`${t.x},${t.y}`, t]));
    const plain = evaluateSettlementCandidate("player-1", lone.get("12,10")!, lone, new Set(["12,10"]));
    const linked = evaluateSettlementCandidate("player-1", lone.get("12,10")!, lone, new Set(["12,10"]), new Set(["14,10"]));
    expect(linked.score).toBe(plain.score);
  });

  it("selects towns with a Trade Nexus in reach or two Manufactories, below the 3-town cap", () => {
    expect([...linkValueTownKeys([
      entry("1,1", { tradeNexusInReach: true, connectedTownCount: 1 }),
      entry("2,2", { manufactories: 2 }),
      entry("3,3", { manufactories: 1 }),
      entry("4,4", { tradeNexusInReach: true, connectedTownCount: 3 })
    ])]).toEqual(["1,1", "2,2"]);
  });
});
