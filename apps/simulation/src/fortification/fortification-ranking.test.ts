import { describe, expect, it } from "vitest";

import { computeFortificationRanking, type FortificationRankingTile } from "./fortification-ranking.js";

describe("computeFortificationRanking", () => {
  it("sums tier weight * garrison fill ratio per owner, active forts only", () => {
    const tiles: FortificationRankingTile[] = [
      { fort: { ownerId: "p1", status: "active", variant: "FORT", garrison: 150, garrisonCap: 300 } }, // weight 2.5 * 0.5
      { fort: { ownerId: "p1", status: "active", variant: "THUNDER_BASTION", garrison: 300, garrisonCap: 300 } }, // weight 8 * 1
      { fort: { ownerId: "p1", status: "under_construction", variant: "FORT", garrison: 0, garrisonCap: 300 } }, // excluded
      { fort: { ownerId: "p2", status: "active", variant: "WOODEN_FORT", garrison: 0, garrisonCap: 150 } } // weight 1.35 * 0
    ];
    const ranking = computeFortificationRanking(tiles);
    expect(ranking[0]).toEqual({ playerId: "p1", score: 9.25, forts: 2, garrisonFillPct: 0.75 });
    expect(ranking[1]).toEqual({ playerId: "p2", score: 0, forts: 1, garrisonFillPct: 0 });
  });

  it("returns empty for tiles with no active forts", () => {
    expect(computeFortificationRanking([{ ownerId: "p1" }])).toEqual([]);
  });

  it("treats a missing garrisonCap as zero fill", () => {
    const tiles: FortificationRankingTile[] = [{ fort: { ownerId: "p1", status: "active", variant: "FORT" } }];
    expect(computeFortificationRanking(tiles)).toEqual([{ playerId: "p1", score: 0, forts: 1, garrisonFillPct: 0 }]);
  });
});
