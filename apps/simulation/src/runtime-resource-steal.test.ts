import { describe, expect, it } from "vitest";
import type { DomainPlayer } from "@border-empires/game-domain";
import type { PlayerRuntimeSummary } from "./player-runtime-summary.js";
import { applyResourceTileSteal, stolenResourceForCapture } from "./runtime-resource-steal.js";

const makePlayer = (id: string, strategicResources: DomainPlayer["strategicResources"]): DomainPlayer => ({
  id,
  isAi: false,
  points: 0,
  manpower: 0,
  techIds: new Set(),
  domainIds: new Set(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-local",
  allies: new Set(),
  strategicResources
});

const summary = (overrides: Partial<PlayerRuntimeSummary> = {}): PlayerRuntimeSummary => ({
  territoryTileKeys: new Set(),
  frontierTileKeys: new Set(),
  hotFrontierTileKeys: new Set(),
  strategicFrontierTileKeys: new Set(),
  buildCandidateTileKeys: new Set(),
  settledTileCount: 0,
  townCount: 0,
  ownedTownTierByTile: new Map(),
  goldIncomePerMinute: 0,
  strategicProductionPerMinute: { FOOD: 0, IRON: 60 / 1440, CRYSTAL: 0, SUPPLY: 0, SHARD: 0 },
  activeDevelopmentProcessCount: 0,
  pendingSettlementsByTile: new Map(),
  fishFoodPerMinute: 0,
  synthesizerCapBonus: { IRON: 0, CRYSTAL: 0, SUPPLY: 0 },
  lastActiveAtMs: 0,
  ...overrides
});

describe("resource capture steal", () => {
  it("maps tile and synthesizer resources to strategic balances", () => {
    expect(stolenResourceForCapture("IRON")).toBe("IRON");
    expect(stolenResourceForCapture("GEMS")).toBe("CRYSTAL");
    expect(stolenResourceForCapture("WOOD")).toBe("SUPPLY");
    expect(stolenResourceForCapture(undefined, "ADVANCED_FUR_SYNTHESIZER")).toBe("SUPPLY");
    expect(stolenResourceForCapture("UNKNOWN")).toBeUndefined();
  });

  it("steals a proportional share based on defender resource source count", () => {
    const attacker = makePlayer("attacker", {});
    const defender = makePlayer("defender", { IRON: 90 });
    applyResourceTileSteal(
      { summaryForPlayer: () => summary({ strategicProductionPerMinute: { FOOD: 0, IRON: 180 / 1440, CRYSTAL: 0, SUPPLY: 0, SHARD: 0 } }) },
      attacker,
      defender,
      "IRON"
    );

    expect(defender.strategicResources?.IRON).toBeCloseTo(60, 5);
    expect(attacker.strategicResources?.IRON).toBeCloseTo(30, 5);
  });
});
