import { describe, expect, it } from "vitest";
import { STARTING_CAPITAL_MANPOWER_REGEN_PER_MINUTE } from "./config.js";
import { LANDING_MANPOWER_RESERVE, landingManpowerReserve, lateJoinManpowerCatchUp } from "./landing-manpower-reserve.js";

const DAY_MS = 24 * 60 * 60_000;
const SEASON_START = 1_700_000_000_000;

describe("landing manpower reserve", () => {
  it("is 2,000 base manpower", () => {
    expect(LANDING_MANPOWER_RESERVE).toBe(2_000);
  });

  it("adds nothing for an empire landing at the season start, before it, or with no active season", () => {
    expect(lateJoinManpowerCatchUp(SEASON_START, SEASON_START)).toBe(0);
    expect(lateJoinManpowerCatchUp(SEASON_START - DAY_MS, SEASON_START)).toBe(0);
    expect(lateJoinManpowerCatchUp(SEASON_START + DAY_MS, undefined)).toBe(0);
    expect(landingManpowerReserve(SEASON_START + DAY_MS, undefined)).toBe(LANDING_MANPOWER_RESERVE);
  });

  it("adds what a one-town empire would have regenerated since the season started", () => {
    // 0.4/min starting-capital regen -> 576 per day, 2,880 by day 5.
    expect(lateJoinManpowerCatchUp(SEASON_START + DAY_MS, SEASON_START)).toBe(1_440 * STARTING_CAPITAL_MANPOWER_REGEN_PER_MINUTE);
    expect(lateJoinManpowerCatchUp(SEASON_START + 5 * DAY_MS, SEASON_START)).toBe(2_880);
    expect(landingManpowerReserve(SEASON_START + 5 * DAY_MS, SEASON_START)).toBe(LANDING_MANPOWER_RESERVE + 2_880);
  });
});
