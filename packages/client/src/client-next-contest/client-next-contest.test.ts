import { describe, expect, it } from "vitest";

import type { ClientState } from "../client-state/client-state.js";
import {
  applyInitNextContest,
  applyNextContestErrorCode,
  applyNextContestUpdate,
  nextContestButtonLabel,
  nextContestFineprint,
  NEXT_CONTEST_DEFAULT_THRESHOLD
} from "./client-next-contest.js";

const makeState = (overrides: Record<string, unknown> = {}) => ({
  me: "p1",
  authIsGuest: false,
  seasonEndStarting: false,
  seasonStartError: undefined as string | undefined,
  seasonWinner: { playerId: "w", playerName: "W", crownedAt: 1, objectiveId: "TOWN_CONTROL", objectiveName: "Town Control" } as ClientState["seasonWinner"],
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
    expect(nextContestButtonLabel(makeState({ seasonEndStarting: true, seasonStartVoted: true }))).toBe("Starting the next Sector Contest…");
    expect(nextContestButtonLabel(makeState({ seasonEndStarting: true }))).toBe("Join now · the next Sector Contest is starting");
  });

  it("explains when the next contest starts", () => {
    expect(nextContestFineprint(10)).toContain("starts once 10 Houses have committed");
    expect(nextContestFineprint(10, true, true)).toContain("brought into the new Sector Contest automatically");
    expect(nextContestFineprint(10, true, false)).toContain("Join now to start in it");
  });

  // Regression: nothing showed that a start was under way, so repeated
  // presses looked like they did nothing until the world rolled over.
  it("follows the gateway's starting announcement and INIT", () => {
    const state = makeState({ seasonStartError: "old" });
    applyNextContestUpdate(state, { voteCount: 1, threshold: 10, votedBy: ["p1"], starting: true });
    expect(state).toMatchObject({ seasonEndStarting: true, seasonStartError: undefined });
    applyNextContestUpdate(state, { voteCount: 1, threshold: 10, votedBy: ["p1"], starting: false });
    expect(state.seasonEndStarting).toBe(false);
    // An older gateway omits `starting`: keep the local (optimistic) state.
    state.seasonEndStarting = true;
    applyNextContestUpdate(state, { voteCount: 2, threshold: 10, votedBy: ["p1", "p2"] });
    expect(state.seasonEndStarting).toBe(true);
    applyInitNextContest(state, { seasonStartStarting: true });
    expect(state.seasonEndStarting).toBe(true);
    applyInitNextContest(state, {});
    expect(state.seasonEndStarting).toBe(false);
  });

  // Regression: a refused press only reached the event feed, hidden behind
  // the season-end overlay.
  it("reverts the start and keeps the reason when the gateway refuses it", () => {
    const state = makeState({ seasonEndStarting: true });
    expect(applyNextContestErrorCode(state, "FORCE_START_FORBIDDEN", "Only the admin account can force-start.")).toBe(true);
    expect(state).toMatchObject({ seasonEndStarting: false, seasonStartError: "Only the admin account can force-start." });
    expect(applyNextContestErrorCode(state, "FORBIDDEN", "fog toggle unavailable")).toBe(false);
    expect(applyNextContestErrorCode(makeState({ seasonWinner: undefined }), "SEASON_NOT_READY", "x")).toBe(false);
  });
});
