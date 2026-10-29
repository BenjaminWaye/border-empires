import { describe, expect, it } from "vitest";
import type { SimulationSeasonState } from "@border-empires/sim-protocol";
import { createInitialSeasonState } from "../season-lifecycle.js";
import { seasonStartedAtClock } from "./season-bootstrap.js";

const season = (overrides: Partial<SimulationSeasonState> = {}): SimulationSeasonState => ({
  ...createInitialSeasonState({ seasonSequence: 3, rulesetId: "standard", worldSeed: 1, startedAt: 5_000 }),
  ...overrides
});

describe("seasonStartedAtClock", () => {
  it("reads the live season's start while it is the runtime's season and active", () => {
    let current = season();
    const clock = seasonStartedAtClock(() => current, current.seasonId);
    expect(clock()).toBe(5_000);
    // A pending season activating re-stamps startedAt; the clock follows it.
    current = { ...current, startedAt: 9_000 };
    expect(clock()).toBe(9_000);
  });

  it("is undefined while the season is pending or ended", () => {
    expect(seasonStartedAtClock(() => season({ status: "pending" }), season().seasonId)()).toBeUndefined();
    expect(seasonStartedAtClock(() => season({ status: "ended" }), season().seasonId)()).toBeUndefined();
  });

  it("is undefined for a next-season runtime until the rollover swaps the live season over", () => {
    // Otherwise the new season's AI empires would land measured against the
    // ended season's start and get weeks of late-join catch-up.
    const ending = season({ seasonId: "season-old", startedAt: 1_000 });
    expect(seasonStartedAtClock(() => ending, "season-new")()).toBeUndefined();
  });
});
