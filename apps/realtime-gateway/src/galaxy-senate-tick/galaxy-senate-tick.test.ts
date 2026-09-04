import { describe, expect, it } from "vitest";
import {
  computeDominionVoteWeight,
  currentGlobalCycleIndex,
  isTargetOnCooldown,
  resolveSenateProposal,
  GALAXY_SENATE_ACTIONS,
  MIN_DISTINCT_VOTERS
} from "./galaxy-senate-tick.js";
import { GALAXY_CYCLE_LENGTH_MS } from "../galaxy-cycle-tick/galaxy-cycle-tick.js";

describe("currentGlobalCycleIndex", () => {
  it("is 0 at the epoch and advances one per GALAXY_CYCLE_LENGTH_MS", () => {
    expect(currentGlobalCycleIndex(0)).toBe(0);
    expect(currentGlobalCycleIndex(GALAXY_CYCLE_LENGTH_MS - 1)).toBe(0);
    expect(currentGlobalCycleIndex(GALAXY_CYCLE_LENGTH_MS)).toBe(1);
    expect(currentGlobalCycleIndex(GALAXY_CYCLE_LENGTH_MS * 5 + 100)).toBe(5);
  });
});

describe("computeDominionVoteWeight", () => {
  it("matches §13's worked \"wide\" comparison (70.8)", () => {
    const weight = computeDominionVoteWeight({ planets: 6, outposts: 2, totalStability: 6 * 60 + 2 * 60 });
    expect(weight).toBeCloseTo(70.8, 5);
  });

  it("matches §13's worked \"tall\" comparison (71.8)", () => {
    const weight = computeDominionVoteWeight({
      planets: 3,
      outposts: 1,
      developments: 10,
      wonders: 1,
      totalStability: 4 * 95
    });
    expect(weight).toBeCloseTo(71.8, 5);
  });

  it("defaults developments/wonders to 0 when omitted", () => {
    expect(computeDominionVoteWeight({ planets: 1, outposts: 0, totalStability: 100 })).toBe(11);
  });
});

describe("resolveSenateProposal", () => {
  it("passes when quorum and the 3-distinct-voter floor are both cleared", () => {
    const votes = [
      { voterAuthUid: "a", weight: 50 },
      { voterAuthUid: "b", weight: 50 },
      { voterAuthUid: "c", weight: 25 }
    ];
    // EMBARGO quorum is 25%; 125/400 = 31.25% clears it.
    const result = resolveSenateProposal("EMBARGO", votes, 400);
    expect(result.status).toBe("PASSED");
    expect(result.supportWeight).toBe(125);
    expect(result.distinctVoters).toBe(3);
  });

  it("fails when weight clears quorum but fewer than 3 distinct voters supported it", () => {
    const votes = [
      { voterAuthUid: "a", weight: 200 },
      { voterAuthUid: "b", weight: 200 }
    ];
    const result = resolveSenateProposal("EMBARGO", votes, 400); // 100% weight, only 2 voters
    expect(result.status).toBe("FAILED");
    expect(result.distinctVoters).toBe(2);
  });

  it("fails when there are enough distinct voters but weight doesn't clear quorum", () => {
    const votes = [
      { voterAuthUid: "a", weight: 1 },
      { voterAuthUid: "b", weight: 1 },
      { voterAuthUid: "c", weight: 1 }
    ];
    const result = resolveSenateProposal("CONTEST", votes, 1000); // CONTEST needs 40%
    expect(result.status).toBe("FAILED");
  });

  it("never passes with zero total galaxy weight, even with support votes", () => {
    const votes = [
      { voterAuthUid: "a", weight: 0 },
      { voterAuthUid: "b", weight: 0 },
      { voterAuthUid: "c", weight: 0 }
    ];
    expect(resolveSenateProposal("EMBARGO", votes, 0).status).toBe("FAILED");
  });

  it("counts a repeated voter (duplicate vote) once toward the distinct-voter floor", () => {
    const votes = [
      { voterAuthUid: "a", weight: 100 },
      { voterAuthUid: "a", weight: 100 },
      { voterAuthUid: "b", weight: 100 }
    ];
    expect(resolveSenateProposal("EMBARGO", votes, 400).distinctVoters).toBe(2);
  });

  it("exposes the exact §13 cost/quorum/cooldown/duration table", () => {
    expect(GALAXY_SENATE_ACTIONS.EMBARGO).toEqual({ influenceCost: 15, quorumPct: 0.25, cooldownCycles: 1, durationCycles: 2 });
    expect(GALAXY_SENATE_ACTIONS.CONTEST).toEqual({ influenceCost: 40, quorumPct: 0.4, cooldownCycles: 2 });
    expect(MIN_DISTINCT_VOTERS).toBe(3);
  });
});

describe("isTargetOnCooldown", () => {
  it("is never on cooldown when never previously targeted", () => {
    expect(isTargetOnCooldown("EMBARGO", undefined, 10)).toBe(false);
  });

  it("is on cooldown through the configured number of Cycles after resolution", () => {
    // EMBARGO cooldown is 1 Cycle: resolved at cycle 5, still cooling at 5, clear at 6.
    expect(isTargetOnCooldown("EMBARGO", 5, 5)).toBe(true);
    expect(isTargetOnCooldown("EMBARGO", 5, 6)).toBe(false);
  });

  it("respects a longer cooldown (CONTEST: 2 Cycles)", () => {
    expect(isTargetOnCooldown("CONTEST", 5, 6)).toBe(true);
    expect(isTargetOnCooldown("CONTEST", 5, 7)).toBe(false);
  });
});
