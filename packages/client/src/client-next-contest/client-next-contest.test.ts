import { describe, expect, it } from "vitest";

import {
  applyInitNextContest,
  applyNextContestUpdate,
  nextContestButtonLabel,
  nextContestFineprint,
  NEXT_CONTEST_DEFAULT_THRESHOLD
} from "./client-next-contest.js";

const makeState = (overrides: Record<string, unknown> = {}) => ({
  me: "p1",
  authIsGuest: false,
  seasonEndStarting: false,
  seasonStartVoteCount: 0,
  seasonStartVoted: false,
  seasonStartVoteThreshold: NEXT_CONTEST_DEFAULT_THRESHOLD,
  ...overrides
});

describe("next Sector Contest", () => {
  it("applies a commitment broadcast", () => {
    const state = makeState();
    applyNextContestUpdate(state, { voteCount: 3, threshold: 10, votedBy: ["p0", "p1", "p2"] });
    expect(state).toMatchObject({ seasonStartVoteCount: 3, seasonStartVoted: true, seasonStartVoteThreshold: 10 });
    applyNextContestUpdate(state, { voteCount: 4, threshold: 10, votedBy: ["p0", "p2", "p3", "p4"] });
    expect(state.seasonStartVoted).toBe(false);
  });

  // Regression: INIT carried the count but the client ignored it, so a
  // reload showed nobody committed until the next broadcast.
  it("reads the count and the player's own commitment from INIT", () => {
    const state = makeState();
    applyInitNextContest(state, { seasonStartVoteCount: 6, seasonStartVoted: true, seasonStartVoteThreshold: 10 });
    expect(state).toMatchObject({ seasonStartVoteCount: 6, seasonStartVoted: true, seasonStartVoteThreshold: 10 });
    applyInitNextContest(state, {});
    expect(state).toMatchObject({ seasonStartVoteCount: 0, seasonStartVoted: false, seasonStartVoteThreshold: NEXT_CONTEST_DEFAULT_THRESHOLD });
  });

  it("labels the button for each stage", () => {
    expect(nextContestButtonLabel(makeState({ seasonStartVoteCount: 2 }))).toBe("Join the next Sector Contest (2/10)");
    expect(nextContestButtonLabel(makeState({ seasonStartVoteCount: 3, seasonStartVoted: true }))).toBe("You're in · 3/10 Houses committed");
    expect(nextContestButtonLabel(makeState({ authIsGuest: true }))).toBe("Save your empire to join the next Sector Contest");
    expect(nextContestButtonLabel(makeState({ seasonEndStarting: true, seasonStartVoted: true }))).toBe("Winding the Spring…");
  });

  it("explains when the next contest starts", () => {
    expect(nextContestFineprint(10)).toContain("starts once 10 Houses have committed");
  });
});
