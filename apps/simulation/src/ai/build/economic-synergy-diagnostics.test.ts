import { describe, expect, it } from "vitest";

import { economicBuildDiagnostics, summarizeTownEconomy } from "./economic-synergy-diagnostics.js";
import type { TownEconomyEntry } from "./town-economy-view.js";

const entry = (overrides: Partial<TownEconomyEntry>): TownEconomyEntry => ({
  townKey: "1,1",
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
  ...overrides
});

describe("economic synergy diagnostics", () => {
  it("summarises the view into fixed counts", () => {
    expect(summarizeTownEconomy([
      entry({ manufactories: 3, clearingHouseInReach: true, connectedTownCount: 1, tradeNexusInReach: true }),
      entry({ townKey: "2,2", ancillaryDepots: 2, hasAncillaryFactory: true, neuralWorksInReach: true })
    ])).toEqual({
      towns: 2,
      manufactories: 3,
      ancillaryDepots: 2,
      ancillaryFactories: 1,
      connectedTowns: 1,
      townsWithTradeNexusInReach: 1,
      townsWithClearingHouseInReach: 1,
      townsWithNeuralWorksInReach: 1,
      townsWithReserveLatticeInReach: 0
    });
  });

  it("keeps the existing candidate string and adds the rounded score", () => {
    expect(economicBuildDiagnostics({ tile: { x: 4, y: 5 }, structureType: "CLEARING_HOUSE", score: 101.234 }, undefined)).toEqual({
      economicBuildCandidate: "4,5:CLEARING_HOUSE",
      economicBuildScore: 101.2
    });
    expect(economicBuildDiagnostics(undefined, [])).toEqual({});
  });
});
