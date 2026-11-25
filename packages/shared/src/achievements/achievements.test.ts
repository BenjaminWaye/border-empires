import { describe, expect, it } from "vitest";
import { ACHIEVEMENTS, evaluateAchievements, IRON_WALL_MIN_TILES, type AchievementStats } from "./achievements.js";

const none: AchievementStats = { bestTownTierRank: 0, campsCleared: 0, tilesTakenInBattle: 0, tilesExplored: 0, structuresBuilt: 0, ownedTiles: 0, integrityPct: 0 };

describe("evaluateAchievements", () => {
  it("earns nothing for a new House and caps progress at the target", () => {
    expect(evaluateAchievements(none, undefined).newlyEarned).toEqual([]);
    const { progress } = evaluateAchievements({ ...none, campsCleared: 9_999 }, undefined);
    expect(progress.PACIFIER).toBe(50);
  });

  it("earns each badge once, at its target", () => {
    const stats = { ...none, bestTownTierRank: 4, campsCleared: 50, tilesTakenInBattle: 500, tilesExplored: 30_000, structuresBuilt: 100, ownedTiles: IRON_WALL_MIN_TILES, integrityPct: 100 };
    expect(evaluateAchievements(stats, undefined).newlyEarned).toEqual(ACHIEVEMENTS.map((a) => a.id));
    expect(evaluateAchievements(stats, { PACIFIER: 1 }).newlyEarned).not.toContain("PACIFIER");
  });

  it("Iron Wall needs a big realm: 100% Integrity on a small one counts for nothing", () => {
    const small = evaluateAchievements({ ...none, ownedTiles: IRON_WALL_MIN_TILES - 1, integrityPct: 100 }, undefined);
    expect(small.progress.IRON_WALL).toBe(0);
    expect(small.newlyEarned).not.toContain("IRON_WALL");
  });

  it("a City is not a Metropolis", () => {
    expect(evaluateAchievements({ ...none, bestTownTierRank: 2 }, undefined).newlyEarned).not.toContain("METROPOLIS");
  });
});
