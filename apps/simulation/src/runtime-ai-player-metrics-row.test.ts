import { MUSTER_FLAG_BASE_CAP_CEILING, musterFlagCap } from "@border-empires/shared";
import { describe, expect, it } from "vitest";

import { musterFlagTotalsForPlayer } from "./runtime-ai-player-metrics-row.js";

const flag = (ownerId: string, amount: number, capLevel?: number) => ({
  muster: { ownerId, amount, mode: "ADVANCE" as const, updatedAt: 0, ...(capLevel === undefined ? {} : { capLevel }) }
});

describe("musterFlagTotalsForPlayer", () => {
  it("returns zeros for a player with no flag index entry", () => {
    expect(musterFlagTotalsForPlayer("ai-2", undefined, new Map(), 1_500)).toEqual({
      musterFlagCount: 0,
      musterStagedManpower: 0,
      musterFlagCapacity: 0
    });
  });

  it("sums staged manpower and per-flag caps (including capLevel upgrades) across the player's flags", () => {
    const tiles = new Map([
      ["10,10", flag("ai-2", 100)],
      ["11,11", flag("ai-2", 30.5, 2)]
    ]);
    const totals = musterFlagTotalsForPlayer("ai-2", new Set(["10,10", "11,11"]), tiles, 1_500);
    expect(totals.musterFlagCount).toBe(2);
    expect(totals.musterStagedManpower).toBeCloseTo(130.5);
    expect(totals.musterFlagCapacity).toBe(musterFlagCap(1_500, undefined) + musterFlagCap(1_500, 2));
    // Base cap is the ceiling for a big pool, so an unupgraded flag is not unbounded.
    expect(musterFlagCap(1_500, undefined)).toBe(MUSTER_FLAG_BASE_CAP_CEILING);
  });

  it("ignores indexed keys whose tile lost its flag or belongs to another owner (stale index entry)", () => {
    const tiles = new Map([
      ["10,10", flag("ai-2", 100)],
      ["12,12", flag("player-1", 999)],
      ["13,13", {}]
    ]);
    const totals = musterFlagTotalsForPlayer("ai-2", new Set(["10,10", "12,12", "13,13", "gone"]), tiles, 1_500);
    expect(totals.musterFlagCount).toBe(1);
    expect(totals.musterStagedManpower).toBe(100);
  });
});
