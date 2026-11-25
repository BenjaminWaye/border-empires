import { describe, expect, it } from "vitest";
import type { PlayerAchievementState } from "@border-empires/game-domain";
import { countStructureBuilt, countWonAttack } from "./achievement-counters.js";
import { achievementStatsFor, updateAchievements } from "./achievement-view.js";

const won = { attackerId: "p1", attackerWon: true, actionType: "ATTACK" };

describe("achievement counters", () => {
  it("counts a garrisoned camp as cleared and a rival's tile as taken in battle", () => {
    const player: { achievements?: PlayerAchievementState } = {};
    countWonAttack(player, { ...won, previousOwnerId: "barbarian-1", previousOwnershipState: "SETTLED" });
    countWonAttack(player, { ...won, previousOwnerId: "p2", previousOwnershipState: "FRONTIER" });
    expect(player.achievements).toEqual({ campsCleared: 1, tilesTakenInBattle: 1 });
  });

  it("ignores lost attacks, expands, neutral land, own land and camp frontier", () => {
    const player: { achievements?: PlayerAchievementState } = {};
    countWonAttack(player, { ...won, attackerWon: false, previousOwnerId: "p2", previousOwnershipState: "SETTLED" });
    countWonAttack(player, { ...won, actionType: "EXPAND", previousOwnerId: "p2", previousOwnershipState: "SETTLED" });
    countWonAttack(player, { ...won, previousOwnerId: undefined, previousOwnershipState: undefined });
    countWonAttack(player, { ...won, previousOwnerId: "p1", previousOwnershipState: "SETTLED" });
    countWonAttack(player, { ...won, previousOwnerId: "barbarian-1", previousOwnershipState: "FRONTIER" });
    expect(player.achievements).toBeUndefined();
  });

  it("counts finished structures", () => {
    const player: { achievements?: PlayerAchievementState } = {};
    countStructureBuilt(player);
    countStructureBuilt(player);
    expect(player.achievements?.structuresBuilt).toBe(2);
  });
});

describe("updateAchievements", () => {
  it("records a new badge once, with a Chronicle entry, and keeps it after progress drops", () => {
    const player: { achievements?: PlayerAchievementState; eventLog?: never[] } = { achievements: { campsCleared: 50 } };
    const input = { townTiers: ["TOWN", "METROPOLIS"], tilesExplored: 10, ownedTiles: 5, integrityPct: 100 };
    const first = updateAchievements(player, achievementStatsFor(player, input), 1_000);
    expect(first.earned).toEqual({ PACIFIER: 1_000, METROPOLIS: 1_000 });
    expect(player.eventLog).toHaveLength(2);
    const later = updateAchievements(player, achievementStatsFor(player, { ...input, townTiers: [] }), 2_000);
    expect(later.earned).toEqual({ PACIFIER: 1_000, METROPOLIS: 1_000 });
    expect(later.progress.METROPOLIS).toBe(0);
    expect(player.eventLog).toHaveLength(2);
  });
});
