import { describe, expect, it } from "vitest";
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { EMPIRE_INTEGRITY_INCOME_LABEL, coinIncomeBreakdown } from "@border-empires/shared";
import { buildPlayerUpdateEconomySnapshot } from "./player-update-economy.js";
import { createEmptyPlayerRuntimeSummary, applyTileToPlayerSummary } from "../player-runtime-summary.js";

const player: DomainPlayer = {
  id: "player-1",
  isAi: false,
  points: 0,
  manpower: 0,
  techIds: new Set<string>(),
  domainIds: new Set<string>(),
  allies: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  strategicResources: { FOOD: 10 }
};

const settlement: DomainTileState = {
  x: 10,
  y: 10,
  terrain: "LAND",
  ownerId: "player-1",
  ownershipState: "SETTLED",
  town: {
    type: "FARMING",
    populationTier: "SETTLEMENT",
    supportCurrent: 0,
    supportMax: 0,
    isFed: true,
    baseGoldPerMinute: 1,
    population: 100,
    maxPopulation: 1_000,
    connectedTownCount: 0,
    connectedTownBonus: 0,
    hasManufactory: false,
    manufactoryActive: false,
    hasIncubationEngine: false,
    incubationEngineActive: false
  }
};

const snapshotAt = (integrityEconMult: number) => {
  const summary = createEmptyPlayerRuntimeSummary();
  applyTileToPlayerSummary(summary, "10,10", settlement);
  return buildPlayerUpdateEconomySnapshot(player, summary, new Map([["10,10", settlement]]), undefined, integrityEconMult);
};

const sumSources = (rows: readonly { amountPerMinute: number }[]): number => rows.reduce((total, row) => total + row.amountPerMinute, 0);

describe("buildPlayerUpdateEconomySnapshot itemises the Empire Integrity effect", () => {
  it("adds a bonus line so the GOLD sources sum to the income accrual credits", () => {
    const base = snapshotAt(1);
    const bonused = snapshotAt(1.12);
    expect(base.incomePerMinute).toBeGreaterThan(0);
    expect(base.economyBreakdown.GOLD.sources.some((row) => row.label === EMPIRE_INTEGRITY_INCOME_LABEL)).toBe(false);
    const line = bonused.economyBreakdown.GOLD.sources.at(-1);
    expect(line?.label).toBe(EMPIRE_INTEGRITY_INCOME_LABEL);
    expect(line?.amountPerMinute).toBeCloseTo(base.incomePerMinute * 0.12, 6);
    expect(sumSources(bonused.economyBreakdown.GOLD.sources)).toBeCloseTo(bonused.incomePerMinute, 6);
  });

  it("itemises a low-integrity penalty as a negative line", () => {
    const penalised = snapshotAt(0.9);
    const line = penalised.economyBreakdown.GOLD.sources.find((row) => row.label === EMPIRE_INTEGRITY_INCOME_LABEL);
    expect(line?.amountPerMinute).toBeLessThan(0);
    expect(sumSources(penalised.economyBreakdown.GOLD.sources)).toBeCloseTo(penalised.incomePerMinute, 6);
  });

  it("gives the shared client breakdown a headline equal to its visible lines, with no unitemised gap", () => {
    const bonused = snapshotAt(1.12);
    const view = coinIncomeBreakdown({
      incomePerMinute: bonused.incomePerMinute,
      upkeepGoldPerMinute: bonused.upkeepPerMinute.gold,
      sources: bonused.economyBreakdown.GOLD.sources,
      sinks: bonused.economyBreakdown.GOLD.sinks
    });
    expect(view.earned.every((l) => l.kind !== "other")).toBe(true);
    expect(view.integrityPerMinute).toBeCloseTo(bonused.incomePerMinute - snapshotAt(1).incomePerMinute, 6);
  });
});
