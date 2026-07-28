import { describe, expect, it } from "vitest";

import { SEASON_START_VOTE_THRESHOLD, SeasonStartVoteTracker } from "./season-start-vote.js";

describe("SeasonStartVoteTracker", () => {
  it("counts unique voters and reports threshold once reached", () => {
    const tracker = new SeasonStartVoteTracker();
    expect(SEASON_START_VOTE_THRESHOLD).toBe(5);

    for (let i = 0; i < SEASON_START_VOTE_THRESHOLD - 1; i++) {
      const result = tracker.vote(`player-${i}`);
      expect(result.thresholdMet).toBe(false);
      expect(result.count).toBe(i + 1);
    }

    const final = tracker.vote(`player-${SEASON_START_VOTE_THRESHOLD - 1}`);
    expect(final.thresholdMet).toBe(true);
    expect(final.count).toBe(SEASON_START_VOTE_THRESHOLD);
  });

  it("does not double-count a repeat vote from the same player", () => {
    const tracker = new SeasonStartVoteTracker();
    tracker.vote("player-a");
    const result = tracker.vote("player-a");
    expect(result.count).toBe(1);
    expect(tracker.hasVoted("player-a")).toBe(true);
  });

  it("resets voters and count", () => {
    const tracker = new SeasonStartVoteTracker();
    tracker.vote("player-a");
    tracker.reset();
    expect(tracker.getCount()).toBe(0);
    expect(tracker.hasVoted("player-a")).toBe(false);
    expect(tracker.getVoters()).toEqual([]);
  });
});
