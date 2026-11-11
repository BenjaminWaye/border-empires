import { describe, expect, it, vi } from "vitest";
import { applyJoinSeasonErrorCode } from "./client-join-season-errors.js";

const makeState = () => ({ joinSeasonPending: true, joinSeasonOverlayOpen: true });

describe("applyJoinSeasonErrorCode", () => {
  it("stops the spinner and closes the join prompt when the season has ended", () => {
    const state = makeState();
    const renderHud = vi.fn();
    applyJoinSeasonErrorCode(state, "JOIN_SEASON_ENDED", renderHud);
    expect(state).toEqual({ joinSeasonPending: false, joinSeasonOverlayOpen: false });
    expect(renderHud).toHaveBeenCalledTimes(1);
  });

  it("only stops the spinner for a retryable join failure", () => {
    const state = makeState();
    const renderHud = vi.fn();
    applyJoinSeasonErrorCode(state, "JOIN_SEASON_FAILED", renderHud);
    expect(state).toEqual({ joinSeasonPending: false, joinSeasonOverlayOpen: true });
    expect(renderHud).toHaveBeenCalledTimes(1);
  });

  it("ignores SEASON_ENDED from frontier commands and other codes", () => {
    for (const code of ["SEASON_ENDED", "NOT_ADJACENT"]) {
      const state = makeState();
      const renderHud = vi.fn();
      applyJoinSeasonErrorCode(state, code, renderHud);
      expect(state).toEqual(makeState());
      expect(renderHud).not.toHaveBeenCalled();
    }
  });
});
