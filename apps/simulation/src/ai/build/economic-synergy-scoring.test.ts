import { describe, expect, it } from "vitest";

import type { NeedVector } from "./build-need-vector.js";
import {
  averageManufactoriesPerTown,
  connectedTownBonusFor,
  synergyCandidatesForTown,
  type SynergyCandidate,
  type SynergyContext
} from "./economic-synergy-scoring.js";
import type { TownEconomyEntry } from "./town-economy-view.js";

const NEED: NeedVector = {
  MANPOWER_THROUGHPUT: 1,
  MANPOWER_CEILING: 1,
  FOOD_SLOTS: 0,
  TITANIUM_SLOTS: 0,
  UMBRITE_SLOTS: 0,
  CRYSTAL_SLOTS: 0,
  GOLD: 1,
  DEFENSE: 0,
  OFFENSE: 0,
  VICTORY: 0
};

const town = (overrides: Partial<TownEconomyEntry> = {}): TownEconomyEntry => ({
  townKey: "10,10",
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

const ctx = (overrides: Partial<SynergyContext> = {}): SynergyContext => ({ needVector: NEED, averageManufactoriesPerTown: 0, ...overrides });

const pick = (candidates: SynergyCandidate[], type: SynergyCandidate["type"]) => candidates.find((c) => c.type === type);

describe("synergyCandidatesForTown — coin engine", () => {
  it("values a Manufactory more once a Clearing House is in reach, and more again in a bigger town", () => {
    const plain = pick(synergyCandidatesForTown(town(), ctx()), "MANUFACTORY")!;
    const withClearingHouse = pick(synergyCandidatesForTown(town({ clearingHouseInReach: true }), ctx()), "MANUFACTORY")!;
    const metropolis = pick(synergyCandidatesForTown(town({ clearingHouseInReach: true, baseGoldWeight: 2.1 }), ctx()), "MANUFACTORY")!;
    expect(plain.gain).toBeCloseTo(0.1);
    expect(withClearingHouse.gain).toBeCloseTo(0.35);
    expect(withClearingHouse.score).toBeGreaterThan(plain.score);
    expect(metropolis.score).toBeGreaterThan(withClearingHouse.score);
  });

  it("keeps a first Manufactory at or above the old flat score of 54", () => {
    expect(pick(synergyCandidatesForTown(town(), ctx({ needVector: undefined })), "MANUFACTORY")!.score).toBeGreaterThanOrEqual(54);
  });

  it("only proposes a Clearing House once two Manufactories are in reach, and never a second one", () => {
    expect(pick(synergyCandidatesForTown(town({ manufactories: 1 }), ctx()), "CLEARING_HOUSE")).toBeUndefined();
    const two = pick(synergyCandidatesForTown(town({ manufactories: 2 }), ctx()), "CLEARING_HOUSE");
    expect(two?.gain).toBeCloseTo(0.5);
    // Neighbours' Manufactories count via the empire average.
    expect(pick(synergyCandidatesForTown(town({ manufactories: 1, connectedTownCount: 1 }), ctx({ averageManufactoriesPerTown: 1 })), "CLEARING_HOUSE")).toBeDefined();
    expect(pick(synergyCandidatesForTown(town({ manufactories: 3, clearingHouseInReach: true }), ctx()), "CLEARING_HOUSE")).toBeUndefined();
  });

  it("never proposes a Trade Nexus in an isolated town or where one is already in reach", () => {
    expect(pick(synergyCandidatesForTown(town(), ctx()), "TRADE_NEXUS")).toBeUndefined();
    expect(pick(synergyCandidatesForTown(town({ connectedTownCount: 2, tradeNexusInReach: true, connectedTownBonus: 0.9 }), ctx()), "TRADE_NEXUS")).toBeUndefined();
  });

  it("ranks a Trade Nexus for a connected town above another Manufactory", () => {
    const candidates = synergyCandidatesForTown(town({ connectedTownCount: 2, manufactories: 1 }), ctx());
    expect(pick(candidates, "TRADE_NEXUS")!.score).toBeGreaterThan(pick(candidates, "MANUFACTORY")!.score);
  });

  it("caps coin scores below the food-crisis Incubation Engine (160)", () => {
    const candidates = synergyCandidatesForTown(town({ connectedTownCount: 3, manufactories: 6, baseGoldWeight: 2.1 }), ctx());
    for (const candidate of candidates.filter((c) => ["MANUFACTORY", "CLEARING_HOUSE", "TRADE_NEXUS"].includes(c.type))) {
      expect(candidate.score).toBeLessThan(160);
    }
  });
});

describe("synergyCandidatesForTown — manpower engine", () => {
  it("scores Ancillary Depots higher with a Reserve Lattice in reach", () => {
    const plain = pick(synergyCandidatesForTown(town(), ctx()), "ANCILLARY_DEPOT")!;
    const lattice = pick(synergyCandidatesForTown(town({ reserveLatticeInReach: true }), ctx()), "ANCILLARY_DEPOT")!;
    expect(plain.gain).toBe(180);
    expect(lattice.gain).toBe(255);
    expect(lattice.score).toBeGreaterThan(plain.score);
  });

  it("proposes a Reserve Lattice only with two Depots in reach and none already", () => {
    expect(pick(synergyCandidatesForTown(town({ ancillaryDepots: 1, depotTownsInReach: 1 }), ctx()), "RESERVE_LATTICE")).toBeUndefined();
    expect(pick(synergyCandidatesForTown(town({ ancillaryDepots: 2, depotTownsInReach: 1 }), ctx()), "RESERVE_LATTICE")).toBeDefined();
    expect(pick(synergyCandidatesForTown(town({ ancillaryDepots: 1, depotTownsInReach: 2 }), ctx()), "RESERVE_LATTICE")).toBeDefined();
    expect(pick(synergyCandidatesForTown(town({ ancillaryDepots: 3, depotTownsInReach: 1, reserveLatticeInReach: true }), ctx()), "RESERVE_LATTICE")).toBeUndefined();
  });

  it("values an Ancillary Factory more inside a Neural Works network and never proposes a second at one town", () => {
    const plain = pick(synergyCandidatesForTown(town(), ctx()), "ANCILLARY_FACTORY")!;
    const networked = pick(synergyCandidatesForTown(town({ neuralWorksInReach: true }), ctx()), "ANCILLARY_FACTORY")!;
    expect(networked.score).toBeGreaterThan(plain.score);
    expect(pick(synergyCandidatesForTown(town({ hasAncillaryFactory: true }), ctx()), "ANCILLARY_FACTORY")).toBeUndefined();
  });

  it("proposes Neural Works only with two Factories in reach and none already", () => {
    expect(pick(synergyCandidatesForTown(town({ ancillaryFactoriesInReach: 1 }), ctx()), "NEURAL_WORKS")).toBeUndefined();
    expect(pick(synergyCandidatesForTown(town({ ancillaryFactoriesInReach: 3 }), ctx()), "NEURAL_WORKS")?.score).toBeCloseTo(160);
    expect(pick(synergyCandidatesForTown(town({ ancillaryFactoriesInReach: 3, neuralWorksInReach: true }), ctx()), "NEURAL_WORKS")).toBeUndefined();
  });

  it("proposes no manpower building without a need vector or with no manpower need", () => {
    const types = (c: SynergyContext) => synergyCandidatesForTown(town({ ancillaryDepots: 2, ancillaryFactoriesInReach: 2 }), c).map((x) => x.type);
    expect(types(ctx({ needVector: undefined }))).toEqual(["MANUFACTORY"]);
    expect(types(ctx({ needVector: { ...NEED, MANPOWER_CEILING: 0, MANPOWER_THROUGHPUT: 0 } }))).toEqual(["MANUFACTORY"]);
  });
});

describe("helpers", () => {
  it("connectedTownBonusFor follows the 50/40/30 ladder, capped at three towns", () => {
    expect(connectedTownBonusFor(0)).toBe(0);
    expect(connectedTownBonusFor(1)).toBeCloseTo(0.5);
    expect(connectedTownBonusFor(3)).toBeCloseTo(1.2);
    expect(connectedTownBonusFor(7)).toBeCloseTo(1.2);
  });

  it("averageManufactoriesPerTown handles an empty view", () => {
    expect(averageManufactoriesPerTown([])).toBe(0);
    expect(averageManufactoriesPerTown([town({ manufactories: 2 }), town({ manufactories: 0 })])).toBe(1);
  });
});
