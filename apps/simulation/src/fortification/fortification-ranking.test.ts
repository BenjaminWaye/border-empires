import { describe, expect, it } from "vitest";

import { computeFortificationRanking, type FortificationRankingTile } from "./fortification-ranking.js";

describe("computeFortificationRanking", () => {
  it("sums tier weight per owner, active forts only", () => {
    const tiles: FortificationRankingTile[] = [
      { fort: { ownerId: "p1", status: "active", variant: "FORT" } }, // weight 2.5
      { fort: { ownerId: "p1", status: "active", variant: "THUNDER_BASTION" } }, // weight 8
      { fort: { ownerId: "p1", status: "under_construction", variant: "FORT" } }, // excluded
      { fort: { ownerId: "p2", status: "active", variant: "WOODEN_FORT" } } // weight 1.35
    ];
    const ranking = computeFortificationRanking(tiles);
    expect(ranking[0]).toEqual({ playerId: "p1", score: 10.5, forts: 2 });
    expect(ranking[1]).toEqual({ playerId: "p2", score: 1.35, forts: 1 });
  });

  it("returns empty for tiles with no active forts", () => {
    expect(computeFortificationRanking([{ ownerId: "p1" }])).toEqual([]);
  });

  it("defaults to FORT tier weight when variant is missing", () => {
    const tiles: FortificationRankingTile[] = [{ fort: { ownerId: "p1", status: "active" } }];
    expect(computeFortificationRanking(tiles)).toEqual([{ playerId: "p1", score: 2.5, forts: 1 }]);
  });
});
