import { describe, expect, it, vi } from "vitest";
import { handleStartNewSeasonMessage, type StartNewSeasonMessageDeps } from "./handle-start-new-season-message.js";
import { SeasonStartVoteTracker } from "./season-start-vote.js";

const makeDeps = (overrides: Partial<StartNewSeasonMessageDeps> = {}) => {
  const deps = {
    playerId: "p1",
    isAdmin: false,
    force: false,
    seasonStartVote: new SeasonStartVoteTracker(),
    sendError: vi.fn(),
    broadcastVoteUpdate: vi.fn(),
    startNextSeason: vi.fn(async () => ({ seasonId: "s2" })),
    onSeasonStarted: vi.fn(),
    recordGatewayEvent: vi.fn(),
    ...overrides
  };
  return deps;
};

describe("handleStartNewSeasonMessage", () => {
  it("admin force-start skips the vote threshold but still uses the non-forced sim start", async () => {
    const seasonStartVote = new SeasonStartVoteTracker();
    seasonStartVote.vote("p1"); // admin already voted; 1 of 2 votes
    const deps = makeDeps({ isAdmin: true, force: true, seasonStartVote });
    await handleStartNewSeasonMessage(deps);
    // No sim force: the sim keeps refusing to reset a season that hasn't ended.
    expect(deps.startNextSeason).toHaveBeenCalledWith();
    expect(deps.onSeasonStarted).toHaveBeenCalledWith("s2", true);
    expect(deps.sendError).not.toHaveBeenCalled();
  });

  it("rejects force from a non-admin without voting or starting", async () => {
    const deps = makeDeps({ force: true });
    await handleStartNewSeasonMessage(deps);
    expect(deps.sendError).toHaveBeenCalledWith("FORBIDDEN", expect.any(String));
    expect(deps.startNextSeason).not.toHaveBeenCalled();
    expect(deps.seasonStartVote.getCount()).toBe(0);
  });

  it("a normal vote below threshold only broadcasts the tally", async () => {
    const deps = makeDeps({ isAdmin: true });
    await handleStartNewSeasonMessage(deps);
    expect(deps.broadcastVoteUpdate).toHaveBeenCalledWith(expect.objectContaining({ voteCount: 1, votedBy: ["p1"] }));
    expect(deps.startNextSeason).not.toHaveBeenCalled();
  });

  it("starts without force once the vote threshold is met", async () => {
    const seasonStartVote = new SeasonStartVoteTracker();
    seasonStartVote.vote("p0");
    const deps = makeDeps({ seasonStartVote });
    await handleStartNewSeasonMessage(deps);
    expect(deps.startNextSeason).toHaveBeenCalledWith();
    expect(deps.onSeasonStarted).toHaveBeenCalledWith("s2", false);
  });

  it("reports SEASON_NOT_READY when the sim rejects the start", async () => {
    const deps = makeDeps({ isAdmin: true, force: true, startNextSeason: vi.fn(async () => { throw new Error("nope"); }) });
    await handleStartNewSeasonMessage(deps);
    expect(deps.sendError).toHaveBeenCalledWith("SEASON_NOT_READY", expect.any(String));
    expect(deps.onSeasonStarted).not.toHaveBeenCalled();
  });
});
