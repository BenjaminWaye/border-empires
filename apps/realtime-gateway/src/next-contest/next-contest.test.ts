import { describe, expect, it, vi } from "vitest";

import { InMemorySectorWaitlistStore } from "../sector-waitlist-store/sector-waitlist-store.js";
import { createNextContest, NEXT_CONTEST_MIN_COMMITTED, startNextContestTimer, type NextContestDeps } from "./next-contest.js";

const makeDeps = (overrides: Partial<NextContestDeps> = {}) => {
  let season = { seasonId: "season-1", status: "ended" };
  const deps = {
    store: new InMemorySectorWaitlistStore(),
    getCurrentSeason: vi.fn(async () => season),
    startNextSeason: vi.fn(async () => {
      season = { seasonId: "season-2", status: "active" };
      return { seasonId: "season-2" };
    }),
    joinSeason: vi.fn(async () => ({ spawned: true })),
    onSeasonStarted: vi.fn(),
    broadcast: vi.fn(),
    recordGatewayEvent: vi.fn(),
    minCommitted: 3,
    now: () => 1_000,
    ...overrides
  };
  return { deps, setSeason: (next: { seasonId: string; status: string }) => { season = next; } };
};

describe("next contest", () => {
  it("needs ten committed Houses by default", () => {
    expect(NEXT_CONTEST_MIN_COMMITTED).toBe(10);
    expect(createNextContest({ ...makeDeps().deps, minCommitted: undefined }).threshold).toBe(10);
  });

  it("refuses guests without recording them", async () => {
    const { deps } = makeDeps();
    const nextContest = createNextContest(deps);
    expect(await nextContest.commit("guest-1", true)).toMatchObject({ ok: false, code: "ACCOUNT_REQUIRED" });
    expect(await deps.store.count("season-1")).toBe(0);
    expect(deps.broadcast).not.toHaveBeenCalled();
  });

  it("refuses commitments while the season is still running", async () => {
    const { deps, setSeason } = makeDeps();
    setSeason({ seasonId: "season-1", status: "active" });
    const result = await createNextContest(deps).commit("p1", false);
    expect(result).toMatchObject({ ok: false, code: "SEASON_NOT_ENDED" });
    expect(deps.startNextSeason).not.toHaveBeenCalled();
  });

  it("broadcasts the count below the threshold without starting", async () => {
    const { deps } = makeDeps();
    const nextContest = createNextContest(deps);
    expect(await nextContest.commit("p1", false)).toEqual({ ok: true, count: 1, started: false });
    expect(await nextContest.commit("p1", false)).toEqual({ ok: true, count: 1, started: false });
    expect(deps.broadcast).toHaveBeenLastCalledWith({ type: "SEASON_START_VOTE_UPDATE", voteCount: 1, threshold: 3, votedBy: ["p1"] });
    expect(nextContest.initFields("p1")).toEqual({ seasonStartVoteCount: 1, seasonStartVoted: true, seasonStartVoteThreshold: 3 });
    expect(nextContest.initFields("p2")).toMatchObject({ seasonStartVoted: false });
    expect(deps.startNextSeason).not.toHaveBeenCalled();
  });

  it("starts at the threshold and joins every committed House", async () => {
    const { deps } = makeDeps();
    const nextContest = createNextContest(deps);
    await nextContest.commit("p1", false);
    await nextContest.commit("p2", false);
    expect(await nextContest.commit("p3", false)).toEqual({ ok: true, count: 3, started: true });
    expect(deps.startNextSeason).toHaveBeenCalledTimes(1);
    expect(deps.onSeasonStarted).toHaveBeenCalledWith("season-2", false);
    expect(deps.joinSeason.mock.calls.map(([playerId]) => playerId)).toEqual(["p1", "p2", "p3"]);
    expect(nextContest.initFields("p1")).toMatchObject({ seasonStartVoteCount: 0, seasonStartVoted: false });
  });

  it("keeps joining the rest when one join fails", async () => {
    const joinSeason = vi.fn(async (playerId: string) => {
      if (playerId === "p2") throw new Error("boom");
      return { spawned: true };
    });
    const { deps } = makeDeps({ joinSeason });
    const nextContest = createNextContest(deps);
    for (const playerId of ["p1", "p2", "p3"]) await nextContest.commit(playerId, false);
    expect(joinSeason).toHaveBeenCalledTimes(3);
    expect(deps.recordGatewayEvent).toHaveBeenCalledWith("warn", "gateway_next_contest_join_failed", expect.objectContaining({ playerId: "p2" }));
  });

  it("starts from rows waitlisted while the Sector was full once it has ended", async () => {
    const { deps } = makeDeps();
    for (const playerId of ["a", "b", "c"]) await deps.store.join({ seasonId: "season-1", playerId, joinedAt: 1 });
    expect(await createNextContest(deps).maybeStart()).toBe(true);
    expect(deps.joinSeason).toHaveBeenCalledTimes(3);
  });

  it("does not start a running season from the timer", async () => {
    const { deps, setSeason } = makeDeps();
    setSeason({ seasonId: "season-1", status: "active" });
    for (const playerId of ["a", "b", "c"]) await deps.store.join({ seasonId: "season-1", playerId, joinedAt: 1 });
    expect(await createNextContest(deps).maybeStart()).toBe(false);
    expect(deps.startNextSeason).not.toHaveBeenCalled();
  });

  it("admin force-start skips the threshold but only once the season has ended", async () => {
    const { deps, setSeason } = makeDeps();
    const nextContest = createNextContest(deps);
    await nextContest.commit("p1", false);
    expect(await nextContest.forceStart()).toEqual({ seasonId: "season-2" });
    expect(deps.onSeasonStarted).toHaveBeenCalledWith("season-2", true);
    expect(deps.joinSeason).toHaveBeenCalledWith("p1");
    setSeason({ seasonId: "season-2", status: "active" });
    expect(await nextContest.forceStart()).toBeUndefined();
    expect(deps.startNextSeason).toHaveBeenCalledTimes(1);
  });

  it("checks once immediately when the timer starts", async () => {
    const maybeStart = vi.fn(async () => false);
    const timer = startNextContestTimer({ maybeStart }, { intervalMs: 60_000 });
    timer.stop();
    expect(maybeStart).toHaveBeenCalledTimes(1);
  });
});
