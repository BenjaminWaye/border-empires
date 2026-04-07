import { describe, expect, it } from "vitest";

import {
  chooseAiEconomicStructurePlan,
  scoreAiEconomicStructureCandidate,
  type AiEconomicStructureCandidate,
  type AiEconomicStructureContext
} from "./empire-structure-strategy.js";

const baseContext = (): AiEconomicStructureContext => ({
  economicVictoryBias: false,
  foodCoverageLow: false,
  economyWeak: false,
  openingGrowthPhase: false,
  underThreat: false
});

const candidate = (overrides: Partial<AiEconomicStructureCandidate> = {}): AiEconomicStructureCandidate => ({
  tileIndex: 1,
  isTown: false,
  isDock: false,
  supportedTownCount: 0,
  supportedDockCount: 0,
  connectedTownCount: 0,
  connectedDockCount: 0,
  townIncomePerMinute: 0,
  dockIncomePerMinute: 0,
  ...overrides
});

describe("empire structure strategy", () => {
  it("prioritizes customs houses on strong dock routes", () => {
    const plan = chooseAiEconomicStructurePlan(baseContext(), [
      candidate({ tileIndex: 1, resource: "WOOD" }),
      candidate({ tileIndex: 2, isDock: true, connectedDockCount: 2, supportedDockCount: 1, dockIncomePerMinute: 7 })
    ]);

    expect(plan?.tileIndex).toBe(2);
    expect(plan?.structureType).toBe("CUSTOMS_HOUSE");
  });

  it("raises town commercial structures when connected towns stack value", () => {
    const bankScore = scoreAiEconomicStructureCandidate(
      { ...baseContext(), economicVictoryBias: true },
      candidate({
        isTown: true,
        connectedTownCount: 3,
        supportedTownCount: 2,
        townIncomePerMinute: 8,
        townPopulationTier: "CITY"
      }),
      "BANK"
    );
    const marketScore = scoreAiEconomicStructureCandidate(
      { ...baseContext(), economicVictoryBias: true },
      candidate({
        isTown: true,
        connectedTownCount: 1,
        supportedTownCount: 1,
        townIncomePerMinute: 3,
        townPopulationTier: "CITY"
      }),
      "MARKET"
    );

    expect(bankScore).toBeGreaterThan(marketScore);
  });

  it("keeps food recovery biased toward granaries and farmsteads", () => {
    const plan = chooseAiEconomicStructurePlan(
      { ...baseContext(), foodCoverageLow: true, economyWeak: true, openingGrowthPhase: true },
      [
        candidate({ tileIndex: 4, resource: "FARM", supportedTownCount: 1 }),
        candidate({ tileIndex: 5, isTown: true, connectedTownCount: 2, townIncomePerMinute: 6, townPopulationTier: "TOWN" })
      ]
    );

    expect(plan).toBeDefined();
    expect(["FARMSTEAD", "GRANARY"]).toContain(plan?.structureType);
  });
});
