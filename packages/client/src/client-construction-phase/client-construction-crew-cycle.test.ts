import { describe, expect, it } from "vitest";
import { CREW_CYCLE_MS, crewCycleState, crewSeed01 } from "./client-construction-crew-cycle.js";

describe("crewCycleState", () => {
  it("starts at the stack carrying a part and ends the carry leg at the structure (build)", () => {
    expect(crewCycleState(0, 0, "build", false)).toEqual({ along: 0, carrying: true });
    const arrived = crewCycleState(1_999, 0, "build", false);
    expect(arrived.along).toBeGreaterThan(0.99);
    expect(arrived.carrying).toBe(true);
  });

  it("works at the structure, walks back empty, then picks up at the stack", () => {
    expect(crewCycleState(3_000, 0, "build", false)).toEqual({ along: 1, carrying: false });
    const back = crewCycleState(5_500, 0, "build", false);
    expect(back.along).toBeLessThan(1);
    expect(back.carrying).toBe(false);
    expect(crewCycleState(CREW_CYCLE_MS - 100, 0, "build", false)).toEqual({ along: 0, carrying: false });
  });

  it("mirrors the walk for removal: parts are carried toward the stack", () => {
    expect(crewCycleState(0, 0, "remove", false)).toEqual({ along: 1, carrying: true });
    expect(crewCycleState(3_000, 0, "remove", false)).toEqual({ along: 0, carrying: false });
  });

  it("freezes a stalled crew at its work position without carrying", () => {
    expect(crewCycleState(1_000, 0.4, "build", true)).toEqual({ along: 1, carrying: false });
    expect(crewCycleState(1_000, 0.4, "remove", true)).toEqual({ along: 0, carrying: false });
  });

  it("offsets sites by seed so neighbours are out of step, but is periodic", () => {
    expect(crewCycleState(0, 0.5, "build", false)).not.toEqual(crewCycleState(0, 0, "build", false));
    expect(crewCycleState(1_234 + CREW_CYCLE_MS, 0.3, "build", false)).toEqual(crewCycleState(1_234, 0.3, "build", false));
  });
});

describe("crewSeed01", () => {
  it("is stable, within 0..1, and differs between neighbouring tiles", () => {
    expect(crewSeed01(4, 7)).toBe(crewSeed01(4, 7));
    expect(crewSeed01(4, 7)).toBeGreaterThanOrEqual(0);
    expect(crewSeed01(4, 7)).toBeLessThanOrEqual(1);
    expect(crewSeed01(4, 7)).not.toBe(crewSeed01(5, 7));
    expect(crewSeed01(4, 7)).not.toBe(crewSeed01(4, 8));
  });
});
