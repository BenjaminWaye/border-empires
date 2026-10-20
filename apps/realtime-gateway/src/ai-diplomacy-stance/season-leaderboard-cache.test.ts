import { afterEach, describe, expect, it, vi } from "vitest";

import { createSeasonLeaderboardCache } from "./season-leaderboard-cache.js";

const board = (tiles: number) => [{ id: "ai-1", tiles }];

describe("createSeasonLeaderboardCache", () => {
  afterEach(() => vi.useRealTimers());

  it("serves one fetch for the whole window, then refreshes", async () => {
    let now = 0;
    const fetch = vi.fn().mockResolvedValueOnce(board(1)).mockResolvedValueOnce(board(2));
    const cache = createSeasonLeaderboardCache({ fetch, now: () => now, ttlMs: 1_000 });
    expect(await cache()).toEqual(board(1));
    expect(await cache()).toEqual(board(1));
    now = 1_000;
    expect(await cache()).toEqual(board(2));
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  // A failed fetch must not stick: the next call tries again.
  it("doesn't cache failures, and falls back to the last good leaderboard", async () => {
    let now = 0;
    const fetch = vi.fn().mockRejectedValueOnce(new Error("sim down")).mockResolvedValueOnce(board(3)).mockRejectedValueOnce(new Error("again"));
    const cache = createSeasonLeaderboardCache({ fetch, now: () => now, ttlMs: 1_000 });
    expect(await cache()).toBeUndefined();
    expect(await cache()).toEqual(board(3));
    now = 5_000;
    expect(await cache()).toEqual(board(3));
  });

  // Regression: an unanswered GetCurrentSeasonSummary hung every AI truce/alliance answer.
  it("stops waiting on a stalled simulation", async () => {
    vi.useFakeTimers();
    const cache = createSeasonLeaderboardCache({ fetch: () => new Promise(() => undefined), now: () => 0, timeoutMs: 2_000 });
    const result = cache();
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(result).resolves.toBeUndefined();
  });
});
