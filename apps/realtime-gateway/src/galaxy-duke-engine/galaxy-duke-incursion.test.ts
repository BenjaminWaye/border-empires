import { describe, expect, it } from "vitest";
import { MS_PER_DAY } from "../galaxy-production-queue/galaxy-production-queue.js";
import { COURT_PROTECTION_MS } from "../galaxy-court-offer/galaxy-court-offer.js";
import { creditIncursion, landIncursion } from "./galaxy-duke-incursion.js";
import { createDukeState } from "./galaxy-duke-production.js";

const sectors = [{ seasonId: "s1", label: "Aurelia", stability: 100 }];
const landed = (state = createDukeState("u", 0)) => ({ ...state, incursion: { ...state.incursion, arrivesAt: 1_000 } });

describe("landIncursion", () => {
  it("does nothing before the arrival time", () => {
    const state = createDukeState("u", 0);
    expect(landIncursion(state, sectors, 1 * MS_PER_DAY).effects).toEqual([]);
    expect(landIncursion(state, sectors, 1 * MS_PER_DAY).state.incursion.arrivesAt).not.toBeNull();
  });
  it("undefended: Stability -20 and the tooltip says 4 more hits", () => {
    const step = landIncursion(landed(), sectors, 2_000);
    expect(step.effects).toEqual([{ kind: "STABILITY_DELTA", seasonId: "s1", delta: -20 }]);
    expect(step.state.digest.at(-1)?.text).toMatch(/Stability 100 to 80.*4 more hits/);
    expect(step.state.incursion.arrivesAt).toBeNull();
    expect(step.state.incursion.count).toBe(1);
  });
  it("a Defending Fighter repels it with no Stability loss and 20 hull damage", () => {
    const state = { ...landed(), fighters: [{ hull: 100 }] };
    const step = landIncursion(state, sectors, 2_000);
    expect(step.effects).toEqual([]);
    expect(step.state.fighters).toEqual([{ hull: 80 }]);
  });
  it("Court protection suppresses it and emits a counter", () => {
    const state = { ...landed(), courtOffer: { status: "ACCEPTED" as const, acceptedAt: 0 } };
    const step = landIncursion(state, sectors, 2_000);
    expect(step.effects).toEqual([]);
    expect(step.counters).toContain("duke_incursion_suppressed_by_court");
    expect(landIncursion(state, sectors, COURT_PROTECTION_MS + 5_000).effects).toHaveLength(1);
  });
  it("rotates across held Sectors and survives having none", () => {
    const two = [{ seasonId: "a", label: "A", stability: 100 }, { seasonId: "b", label: "B", stability: 100 }];
    const second = { ...landed(), incursion: { ...landed().incursion, count: 1 } };
    expect(landIncursion(second, two, 2_000).effects[0]).toMatchObject({ seasonId: "b" });
    expect(landIncursion(landed(), [], 2_000).effects).toEqual([]);
  });
  it("five undefended hits take a full-Stability Sector to zero", () => {
    let stability = 100;
    let state = landed();
    for (let i = 0; i < 5; i += 1) {
      state = { ...state, incursion: { ...state.incursion, arrivesAt: 1_000 } };
      const step = landIncursion(state, [{ seasonId: "s1", label: "A", stability }], 2_000);
      stability += (step.effects[0] as { delta: number }).delta;
      state = step.state;
    }
    expect(stability).toBe(0);
  });
});

describe("creditIncursion", () => {
  const quiet = () => ({ ...createDukeState("u", 0, 0), incursion: { credit: 0, arrivesAt: null, count: 0, lastCreditCycle: 0 } });
  it("a lone Duke gets one incursion per Cycle", () => {
    const step = creditIncursion(quiet(), 1, 1, 5_000);
    expect(step.state.incursion.arrivesAt).toBe(5_000 + 3 * MS_PER_DAY);
    expect(step.state.incursion.credit).toBe(0);
  });
  it("with four Dukes each gets one every four Cycles", () => {
    let state = quiet();
    const arrivals: number[] = [];
    for (let cycle = 1; cycle <= 8; cycle += 1) {
      const step = creditIncursion(state, 4, cycle, cycle * 1_000);
      if (step.state.incursion.arrivesAt !== null && state.incursion.arrivesAt === null) arrivals.push(cycle);
      state = { ...step.state, incursion: { ...step.state.incursion, arrivesAt: null } };
    }
    expect(arrivals).toEqual([4, 8]);
  });
  it("credits only when a new Cycle has begun, and never banks more than two incursions", () => {
    const step = creditIncursion(quiet(), 1, 0, 1);
    expect(step.state.incursion.credit).toBe(0);
    const burst = creditIncursion({ ...quiet(), incursion: { credit: 0, arrivesAt: 5, count: 0, lastCreditCycle: 0 } }, 1, 500, 1);
    expect(burst.state.incursion.credit).toBe(2);
  });
});
