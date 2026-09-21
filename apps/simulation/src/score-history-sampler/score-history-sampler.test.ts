import { describe, expect, it } from "vitest";

import { createScoreHistorySampler, SCORE_HISTORY_MAX_POINTS, SCORE_HISTORY_SAMPLE_INTERVAL_MS } from "./score-history-sampler.js";

describe("createScoreHistorySampler", () => {
  it("records a sample on the first call", () => {
    const sampler = createScoreHistorySampler();
    sampler.sample("s1", 1_000, [{ id: "p1", name: "Alice", score: 10 }]);
    const series = sampler.seriesFor("s1");
    expect(series).toHaveLength(1);
    expect(series[0]!.points).toEqual([{ t: 1_000, score: 10 }]);
  });

  it("skips sampling before the coarse interval elapses", () => {
    const sampler = createScoreHistorySampler();
    sampler.sample("s1", 0, [{ id: "p1", name: "Alice", score: 10 }]);
    sampler.sample("s1", SCORE_HISTORY_SAMPLE_INTERVAL_MS - 1, [{ id: "p1", name: "Alice", score: 20 }]);
    expect(sampler.seriesFor("s1")[0]!.points).toHaveLength(1);
  });

  it("samples again once the interval elapses", () => {
    const sampler = createScoreHistorySampler();
    sampler.sample("s1", 0, [{ id: "p1", name: "Alice", score: 10 }]);
    sampler.sample("s1", SCORE_HISTORY_SAMPLE_INTERVAL_MS, [{ id: "p1", name: "Alice", score: 20 }]);
    const points = sampler.seriesFor("s1")[0]!.points;
    expect(points).toHaveLength(2);
    expect(points[1]).toEqual({ t: SCORE_HISTORY_SAMPLE_INTERVAL_MS, score: 20 });
  });

  it("caps points per player and thins the oldest first", () => {
    const sampler = createScoreHistorySampler();
    let now = 0;
    for (let i = 0; i < SCORE_HISTORY_MAX_POINTS + 5; i += 1) {
      sampler.sample("s1", now, [{ id: "p1", name: "Alice", score: i }]);
      now += SCORE_HISTORY_SAMPLE_INTERVAL_MS;
    }
    const points = sampler.seriesFor("s1")[0]!.points;
    expect(points).toHaveLength(SCORE_HISTORY_MAX_POINTS);
    expect(points[0]!.score).toBe(5);
    expect(sampler.gauge().capHits).toBeGreaterThan(0);
  });

  it("resets history when the season id changes", () => {
    const sampler = createScoreHistorySampler();
    sampler.sample("s1", 0, [{ id: "p1", name: "Alice", score: 10 }]);
    sampler.sample("s2", 0, [{ id: "p1", name: "Alice", score: 1 }]);
    expect(sampler.seriesFor("s1")).toEqual([]);
    expect(sampler.seriesFor("s2")[0]!.points).toEqual([{ t: 0, score: 1 }]);
  });

  it("reports a gauge of player/point counts", () => {
    const sampler = createScoreHistorySampler();
    sampler.sample("s1", 0, [
      { id: "p1", name: "Alice", score: 10 },
      { id: "p2", name: "Bob", score: 5 }
    ]);
    const gauge = sampler.gauge();
    expect(gauge.playerCount).toBe(2);
    expect(gauge.totalPoints).toBe(2);
    expect(gauge.capHits).toBe(0);
  });
});
