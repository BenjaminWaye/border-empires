import { describe, expect, it } from "vitest";

import { computeGalaxyCycleTick, type GalaxyEconomyTickState } from "./galaxy-cycle-tick.js";

const territory = (
  seasonId: string,
  tier: "PLANET" | "OUTPOST",
  specialization: GalaxyEconomyTickState["territories"][number]["specialization"],
  stability = 100
): GalaxyEconomyTickState["territories"][number] => ({ seasonId, tier, specialization, stability });

describe("computeGalaxyCycleTick", () => {
  it("applies the §26 economy: 2 balanced Planets net +2 Inf and no weekly Production wallet", () => {
    const state: GalaxyEconomyTickState = {
      influence: 0,
      production: 0,
      territories: [territory("s1", "PLANET", "CAPITAL"), territory("s2", "PLANET", "INDUSTRIAL")]
    };
    const result = computeGalaxyCycleTick(state, 1);
    // trickle: 4 + 2 = 6 Inf, upkeep: 2 + 2 = 4 -> net +2
    expect(result.influence).toBe(2);
    // Production is a daily rate feeding the build slot now (galaxy-duke-engine), never a Cycle trickle.
    expect(result.production).toBe(0);
  });

  it("applies the §26 economy: 5 non-Capital/Trade Planets net -6 Inf", () => {
    const territories = [
      territory("s1", "PLANET", "INDUSTRIAL"),
      territory("s2", "PLANET", "INDUSTRIAL"),
      territory("s3", "PLANET", "INDUSTRIAL"),
      territory("s4", "PLANET", "INDUSTRIAL"),
      territory("s5", "PLANET", "INDUSTRIAL")
    ];
    const result = computeGalaxyCycleTick({ influence: 0, production: 0, territories }, 1);
    // trickle: 2*5=10, upkeep: 2+2+3+4+5=16 -> net -6
    expect(result.influence).toBe(-6);
  });

  it("a lone Planet of any specialization is never in deficit (§26: 0 or better)", () => {
    for (const specialization of ["INDUSTRIAL", "EXTRACTION", "LOGISTICS", "CAPITAL", "TRADE"] as const) {
      const result = computeGalaxyCycleTick({ influence: 0, production: 0, territories: [territory("s1", "PLANET", specialization, 60)] }, 1);
      expect(result.influence).toBeGreaterThanOrEqual(0);
      // ...and so it heals rather than draining.
      expect(result.territories[0].stability).toBe(75);
    }
  });

  it("Outposts carry no upkeep", () => {
    const result = computeGalaxyCycleTick(
      { influence: 0, production: 0, territories: [territory("s1", "OUTPOST", "CAPITAL")] },
      1
    );
    expect(result.influence).toBe(2);
    expect(result.production).toBe(0);
  });

  it("drains only the single lowest-Stability territory while net Influence is negative", () => {
    const territories = [
      territory("low", "PLANET", "INDUSTRIAL", 50),
      territory("mid", "PLANET", "INDUSTRIAL", 80),
      territory("high", "PLANET", "INDUSTRIAL", 100),
      territory("extra1", "PLANET", "INDUSTRIAL", 100),
      territory("extra2", "PLANET", "INDUSTRIAL", 100)
    ];
    const result = computeGalaxyCycleTick({ influence: 0, production: 0, territories }, 1);
    expect(result.influence).toBe(-6);
    const bySeasonId = new Map(result.territories.map((t) => [t.seasonId, t.stability]));
    expect(bySeasonId.get("low")).toBe(42);
    expect(bySeasonId.get("mid")).toBe(80);
    expect(bySeasonId.get("high")).toBe(100);
  });

  it("recovers all held territories, capped at 100, while net Influence is positive", () => {
    const territories = [territory("s1", "PLANET", "CAPITAL", 90), territory("s2", "OUTPOST", "CAPITAL", 92)];
    const result = computeGalaxyCycleTick({ influence: 0, production: 0, territories }, 1);
    expect(result.influence).toBeGreaterThan(0);
    const bySeasonId = new Map(result.territories.map((t) => [t.seasonId, t.stability]));
    expect(bySeasonId.get("s1")).toBe(100);
    expect(bySeasonId.get("s2")).toBe(100);
  });

  it("never drains Stability below 0", () => {
    const result = computeGalaxyCycleTick(
      { influence: -1000, production: 0, territories: [territory("s1", "PLANET", "INDUSTRIAL", 3)] },
      1
    );
    expect(result.territories[0].stability).toBe(0);
  });

  it("floors Production at 0 (no debt concept, unlike Influence)", () => {
    // Not reachable via a real trickle table today (every trickle value is
    // >= 0), but the floor is exercised here directly on a Cycle boundary.
    const result = computeGalaxyCycleTick({ influence: 0, production: -50, territories: [] }, 1);
    expect(result.production).toBe(0);
  });

  it("applies multiple whole Cycles in sequence", () => {
    const result = computeGalaxyCycleTick(
      { influence: 0, production: 0, territories: [territory("s1", "PLANET", "CAPITAL", 100)] },
      3
    );
    // Each cycle: +4 -2 = +2 Inf, recovery stays capped at 100.
    expect(result.influence).toBe(6);
    expect(result.territories[0].stability).toBe(100);
  });

  it("cyclesElapsed <= 0 is a no-op", () => {
    const state: GalaxyEconomyTickState = { influence: 5, production: 5, territories: [territory("s1", "PLANET", "CAPITAL", 40)] };
    expect(computeGalaxyCycleTick(state, 0)).toEqual({ influence: 5, production: 5, territories: state.territories });
  });

  it("an active EMBARGO halves trickle (upkeep is untouched)", () => {
    const state: GalaxyEconomyTickState = {
      influence: 0,
      production: 0,
      territories: [territory("s1", "PLANET", "CAPITAL")]
    };
    const withoutEmbargo = computeGalaxyCycleTick(state, 1, false);
    const withEmbargo = computeGalaxyCycleTick(state, 1, true);
    // Without: +4 Inf trickle - 2 upkeep = 2. With: +2 Inf trickle (halved) - 2 upkeep = 0.
    expect(withoutEmbargo.influence).toBe(2);
    expect(withEmbargo.influence).toBe(0);
    expect(withoutEmbargo.production).toBe(0);
    expect(withEmbargo.production).toBe(0);
  });

  it("embargoActive defaults to false when omitted", () => {
    const state: GalaxyEconomyTickState = { influence: 0, production: 0, territories: [territory("s1", "PLANET", "CAPITAL")] };
    expect(computeGalaxyCycleTick(state, 1)).toEqual(computeGalaxyCycleTick(state, 1, false));
  });
});
