import { describe, expect, it } from "vitest";
import { flagTapOpensTown } from "./client-hud-v2-town-runtime.js";

// Regression: tapping a town (or support tile) with a muster flag on it always opened the town screen and
// zoomed in, so updating the flag's orders meant zooming in on the town every time.
describe("tapping a town tile that carries a muster flag", () => {
  const base = { tileKey: "5,5", townScreenOpen: false, lastFlagTapKey: undefined };

  it("selects the flag on the first tap instead of opening the town screen", () => {
    expect(flagTapOpensTown({ ...base, flagged: true, tap: true })).toEqual({ openTown: false, flagTapKey: "5,5" });
  });

  it("opens the town screen on a second tap of the same tile", () => {
    expect(flagTapOpensTown({ ...base, flagged: true, tap: true, lastFlagTapKey: "5,5" })).toEqual({ openTown: true, flagTapKey: undefined });
  });

  it("keeps the flag selected through re-renders, and the town screen open once opened", () => {
    expect(flagTapOpensTown({ ...base, flagged: true, tap: false, lastFlagTapKey: "5,5" }).openTown).toBe(false);
    expect(flagTapOpensTown({ ...base, flagged: true, tap: false, townScreenOpen: true }).openTown).toBe(true);
  });

  it("still opens the town screen straight away when there is no flag", () => {
    expect(flagTapOpensTown({ ...base, flagged: false, tap: true }).openTown).toBe(true);
  });

  it("needs two taps again after tapping another tile", () => {
    const other = flagTapOpensTown({ ...base, tileKey: "6,5", flagged: false, tap: true, lastFlagTapKey: "5,5" });
    expect(flagTapOpensTown({ ...base, flagged: true, tap: true, lastFlagTapKey: other.flagTapKey }).openTown).toBe(false);
  });
});
