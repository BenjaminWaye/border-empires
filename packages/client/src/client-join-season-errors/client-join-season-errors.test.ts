import { describe, expect, it } from "vitest";
import { applyJoinSeasonErrorCode } from "./client-join-season-errors.js";

const makeState = () => ({ joinSeasonPending: true, needsSeasonJoin: true, joinSeasonOverlayOpen: true });

describe("applyJoinSeasonErrorCode", () => {
  it("closes the join prompt for good when the season has ended", () => {
    const state = makeState();
    expect(applyJoinSeasonErrorCode(state, "SEASON_ENDED")).toBe(true);
    expect(state).toEqual({ joinSeasonPending: false, needsSeasonJoin: false, joinSeasonOverlayOpen: false });
  });

  it("only stops the spinner for a retryable join failure", () => {
    const state = makeState();
    expect(applyJoinSeasonErrorCode(state, "JOIN_SEASON_FAILED")).toBe(true);
    expect(state).toEqual({ joinSeasonPending: false, needsSeasonJoin: true, joinSeasonOverlayOpen: true });
  });

  it("ignores unrelated codes", () => {
    const state = makeState();
    expect(applyJoinSeasonErrorCode(state, "NOT_ADJACENT")).toBe(false);
    expect(state.joinSeasonPending).toBe(true);
  });
});
