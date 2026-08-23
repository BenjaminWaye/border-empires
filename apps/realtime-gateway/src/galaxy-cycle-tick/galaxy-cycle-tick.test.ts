import { describe, expect, it } from "vitest";

import { computeGalaxyCycleTick, type GalaxyEconomyTickState } from "./galaxy-cycle-tick.js";

const territory = (
  seasonId: string,
  tier: "PLANET" | "OUTPOST",
  specialization: GalaxyEconomyTickState["territories"][number]["specialization"],
  stability = 100
): GalaxyEconomyTickState["territories"][number] => ({ seasonId, tier, specialization, stability });

describe("computeGalaxyCycleTick", () => {
  it("applies §13's worked example: 2 balanced Planets nets +2 Inf", () => {
    const state: GalaxyEconomyTickState = {
      influence: 0,
      production: 0,
      territories: [territory("s1", "PLANET", "CAPITAL"), territory("s2", "PLANET", "INDUSTRIAL")]
    };
    const result = computeGalaxyCycleTick(state, 1);
    // trickle: 6 + 2 = 8 Inf, upkeep: 3 + 3 = 6 -> net +2
    expect(result.influence).toBe(2);
    expect(result.production).toBe(8 + 24);
  });

  it("applies §13's worked example: 5 non-Capital/Trade Planets nets -8 Inf", () => {
    const territories = [
      territory("s1", "PLANET", "INDUSTRIAL"),
      territory("s2", "PLANET", "INDUSTRIAL"),
      territory("s3", "PLANET", "INDUSTRIAL"),
      territory("s4", "PLANET", "INDUSTRIAL"),
      territory("s5", "PLANET", "INDUSTRIAL")
    ];
    const result = computeGalaxyCycleTick({ influence: 0, production: 0, territories }, 1);
    // trickle: 2*5=10, upkeep: 3+3+3+4+5=18 -> net -8
    expect(result.influence).toBe(-8);
  });

  it("Outposts carry no upkeep", () => {
    const result = computeGalaxyCycleTick(
      { influence: 0, production: 0, territories: [territory("s1", "OUTPOST", "CAPITAL")] },
      1
    );
    expect(result.influence).toBe(2);
    expect(result.production).toBe(3);
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
    expect(result.influence).toBe(-8);
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
    // Each cycle: +6 -3 = +3 Inf, recovery stays capped at 100.
    expect(result.influence).toBe(9);
    expect(result.territories[0].stability).toBe(100);
  });

  it("cyclesElapsed <= 0 is a no-op", () => {
    const state: GalaxyEconomyTickState = { influence: 5, production: 5, territories: [territory("s1", "PLANET", "CAPITAL", 40)] };
    expect(computeGalaxyCycleTick(state, 0)).toEqual({ influence: 5, production: 5, territories: state.territories });
  });
});
