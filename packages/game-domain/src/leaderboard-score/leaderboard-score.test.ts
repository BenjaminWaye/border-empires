import { describe, expect, it } from "vitest";

import { leaderboardScoreFor, leaderboardScoreParts } from "./leaderboard-score.js";

describe("leaderboard score", () => {
  it("is garrisoned tiles + coin/min x 864 + Manifests x 8", () => {
    expect(leaderboardScoreParts(12, 0.005, 1)).toEqual({ tiles: 12, coin: 4.32, manifests: 8 });
    expect(leaderboardScoreFor(12, 0.005, 1)).toBe(24.3);
  });

  // Playtest 2026-11-27: score 25 -> 24 after capturing 19 tiles. Captured frontier adds no tiles term,
  // and the lower Empire Integrity it causes scales the coin term down: by design.
  it("can drop when frontier is captured but not garrisoned", () => {
    const before = leaderboardScoreFor(12, 0.0058, 1); // Integrity bonus on income
    const after = leaderboardScoreFor(12, 0.0046, 1); // same garrisoned land, Integrity lowered by new frontier
    expect(Math.round(after)).toBeLessThan(Math.round(before));
  });
});
