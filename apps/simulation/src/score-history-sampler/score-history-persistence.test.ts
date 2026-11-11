import { describe, expect, it } from "vitest";
import type { CurrentSeasonSummary } from "@border-empires/sim-protocol";

import { createScoreHistorySampler, SCORE_HISTORY_SAMPLE_INTERVAL_MS } from "./score-history-sampler.js";
import { finalScoreHistory, restoreScoreHistory } from "./score-history-persistence.js";

const H = SCORE_HISTORY_SAMPLE_INTERVAL_MS;
const storeWith = (summary: Partial<CurrentSeasonSummary> | undefined) => ({
  loadCurrentSummary: async () => summary as CurrentSeasonSummary | undefined
});
const overall = (score: number) => [{ id: "p1", name: "Waypoint", score }];

describe("score history across restarts", () => {
  // Regression for bug report 364334a9 (season-41): every restart rebuilt the
  // sampler empty, so a crowned season kept only one sample per empire.
  it("keeps the persisted timeline across a restart and ends on the crowning score", async () => {
    const before = createScoreHistorySampler();
    before.sample("season-41", 0, overall(10));
    before.sample("season-41", H, overall(20));
    const persisted = { seasonId: "season-41", scoreHistory: before.seriesFor("season-41") };

    const afterRestart = createScoreHistorySampler();
    await restoreScoreHistory(storeWith(persisted), "season-41", afterRestart);
    // Boot broadcast shortly after restart must not reset or double-sample.
    afterRestart.sample("season-41", H + 1_000, overall(25));
    const crowned = finalScoreHistory(afterRestart, "season-41", H + 60_000, overall(30));

    expect(crowned[0]!.points.map((p) => p.score)).toEqual([10, 20, 30]);
  });

  it("gives at least two points when crowning shortly after a fresh start", () => {
    const sampler = createScoreHistorySampler();
    sampler.sample("season-41", 1_000, overall(10));
    const crowned = finalScoreHistory(sampler, "season-41", 5_000, overall(15));
    expect(crowned[0]!.points).toEqual([{ t: 1_000, score: 10 }, { t: 5_000, score: 15 }]);
  });

  it("ignores a persisted summary from another season", async () => {
    const sampler = createScoreHistorySampler();
    await restoreScoreHistory(storeWith({ seasonId: "season-40", scoreHistory: [{ playerId: "p1", playerName: "A", points: [{ t: 1, score: 1 }] }] }), "season-41", sampler);
    expect(sampler.seriesFor("season-41")).toEqual([]);
  });

  it("resumes the sample interval from the last restored point", async () => {
    const sampler = createScoreHistorySampler();
    await restoreScoreHistory(storeWith({ seasonId: "s", scoreHistory: [{ playerId: "p1", playerName: "A", points: [{ t: H, score: 5 }] }] }), "s", sampler);
    sampler.sample("s", H + 10, overall(6));
    expect(sampler.seriesFor("s")[0]!.points).toHaveLength(1);
    sampler.sample("s", 2 * H, overall(7));
    expect(sampler.seriesFor("s")[0]!.points).toHaveLength(2);
  });
});
