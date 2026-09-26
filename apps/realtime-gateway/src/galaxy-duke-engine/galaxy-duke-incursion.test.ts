import { describe, expect, it } from "vitest";
import { COURT_PROTECTION_MS } from "../galaxy-court-offer/galaxy-court-offer.js";
import { MS_PER_DAY } from "../galaxy-production-queue/galaxy-production-queue.js";
import { accrueIncursions, incursionRatePerCycle, landIncursions } from "./galaxy-duke-incursion.js";
import { findSystem, replaceSystem } from "./galaxy-duke-systems.js";
import { duke, planet } from "./galaxy-duke-fixtures.js";
import type { DukeState } from "./galaxy-duke-types.js";

const labels = new Map([["a", "Aurelia"], ["b", "Vex"]]);
const sectors = new Map([["a", { label: "Aurelia", stability: 100 }], ["b", { label: "Vex", stability: 100 }]]);
const quiet = (planets = [planet("a")]): DukeState => {
  let state = duke(planets);
  for (const s of state.systems) state = replaceSystem(state, { ...s, incursion: { ...s.incursion, arrivesAt: null } });
  return state;
};
const arriving = (state: DukeState, seasonId: string, at: number): DukeState =>
  replaceSystem(state, { ...findSystem(state, seasonId)!, incursion: { ...findSystem(state, seasonId)!.incursion, arrivesAt: at } });

describe("the Warden pool is hardest at the start", () => {
  it("a lone Planet takes the whole pool of 3 a Cycle; every extra Planet eases the share", () => {
    expect([1, 2, 3, 4, 8].map(incursionRatePerCycle)).toEqual([3, 1.5, 1, 0.75, 0.375]);
  });
  it("undefended, a Planet loses Stability until about four Planets share the pool, then it can heal it back", () => {
    // 20 per hit against the +15 a Cycle Stability heals.
    const netPerCycle = (planets: number) => -20 * incursionRatePerCycle(planets) + 15;
    expect(netPerCycle(1)).toBe(-45);
    expect(netPerCycle(2)).toBe(-15);
    expect(netPerCycle(4)).toBe(0);
    expect(netPerCycle(8)).toBeGreaterThan(0);
  });
});

describe("accrueIncursions", () => {
  it("a lone Planet is announced an incursion 24 hours out after a Cycle, with credit left over", () => {
    const step = accrueIncursions(quiet(), 1, labels, 7 * MS_PER_DAY);
    const sys = findSystem(step.state, "a")!;
    expect(sys.incursion.arrivesAt).toBe(7 * MS_PER_DAY + MS_PER_DAY);
    expect(sys.incursion.credit).toBe(1);
    expect(step.state.digest.at(-1)?.text).toBe("Unidentified craft detected near Aurelia. Arrival in 24 hours.");
  });
  it("with four Planets in the galaxy a Planet needs two Cycles to earn one", () => {
    const state = quiet();
    expect(findSystem(accrueIncursions(state, 4, labels, 7 * MS_PER_DAY).state, "a")?.incursion.arrivesAt).toBeNull();
    expect(findSystem(accrueIncursions(state, 4, labels, 14 * MS_PER_DAY).state, "a")?.incursion.arrivesAt).not.toBeNull();
  });
  it("credit never banks more than two incursions, so a long-idle galaxy cannot release a burst", () => {
    const step = accrueIncursions(quiet(), 1, labels, 500 * MS_PER_DAY);
    expect(findSystem(step.state, "a")!.incursion.credit).toBeLessThanOrEqual(1);
  });
  it("each system earns on its own: a Duke with two Planets is attacked twice as often", () => {
    const step = accrueIncursions(quiet([planet("a"), planet("b")]), 4, labels, 14 * MS_PER_DAY);
    expect(step.state.systems.filter((s) => s.incursion.arrivesAt !== null)).toHaveLength(2);
  });
  it("does not schedule a second while one is already on its way", () => {
    const first = accrueIncursions(quiet(), 1, labels, 7 * MS_PER_DAY).state;
    const again = accrueIncursions(first, 1, labels, 8 * MS_PER_DAY - 1);
    expect(findSystem(again.state, "a")!.incursion.arrivesAt).toBe(findSystem(first, "a")!.incursion.arrivesAt);
  });
});

describe("landIncursions", () => {
  it("does nothing before arrival", () => {
    const state = arriving(quiet(), "a", 1_000);
    expect(landIncursions(state, sectors, 999).effects).toEqual([]);
  });
  it("undefended: Stability -20 and the tooltip says 4 more hits", () => {
    const step = landIncursions(arriving(quiet(), "a", 1_000), sectors, 2_000);
    expect(step.effects).toEqual([{ kind: "STABILITY_DELTA", seasonId: "a", delta: -20 }]);
    expect(step.state.digest.at(-1)?.text).toMatch(/Stability 100 to 80.*4 more hits/);
    expect(findSystem(step.state, "a")?.incursion).toMatchObject({ arrivesAt: null, count: 1 });
  });
  it("a Defending Fighter repels it with no Stability loss and 20 hull damage", () => {
    const state = arriving(replaceSystem(quiet(), { ...findSystem(quiet(), "a")!, fighters: [{ hull: 100 }] }), "a", 1_000);
    const step = landIncursions(state, sectors, 2_000);
    expect(step.effects).toEqual([]);
    expect(findSystem(step.state, "a")?.fighters).toEqual([{ hull: 80 }]);
  });
  it("a Fighter only defends its own system", () => {
    let state = quiet([planet("a"), planet("b")]);
    state = replaceSystem(state, { ...findSystem(state, "a")!, fighters: [{ hull: 100 }] });
    state = arriving(arriving(state, "a", 1_000), "b", 1_000);
    const step = landIncursions(state, sectors, 2_000);
    expect(step.effects).toEqual([{ kind: "STABILITY_DELTA", seasonId: "b", delta: -20 }]);
    expect(findSystem(step.state, "a")?.fighters).toEqual([{ hull: 80 }]);
  });
  it("Court protection suppresses it, emits a counter, and expires after 30 days", () => {
    const state = { ...arriving(quiet(), "a", 1_000), courtOffer: { status: "ACCEPTED" as const, acceptedAt: 0 } };
    const step = landIncursions(state, sectors, 2_000);
    expect(step.effects).toEqual([]);
    expect(step.counters).toContain("duke_incursion_suppressed_by_court");
    expect(landIncursions(arriving(state, "a", COURT_PROTECTION_MS + 1), sectors, COURT_PROTECTION_MS + 5_000).effects).toHaveLength(1);
  });
  it("five undefended hits take a full-Stability Sector to zero", () => {
    let stability = 100;
    let state = quiet();
    for (let i = 0; i < 5; i += 1) {
      state = arriving(state, "a", 1_000);
      const step = landIncursions(state, new Map([["a", { label: "A", stability }]]), 2_000);
      stability += (step.effects[0] as { delta: number }).delta;
      state = step.state;
    }
    expect(stability).toBe(0);
  });
  it("a system with no sector view is cleared quietly", () => {
    const step = landIncursions(arriving(quiet(), "a", 1_000), new Map(), 2_000);
    expect(step.effects).toEqual([]);
    expect(findSystem(step.state, "a")?.incursion.arrivesAt).toBeNull();
  });
});
