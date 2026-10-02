import { describe, expect, it } from "vitest";
import type { LeaderboardOverallEntry } from "@border-empires/game-domain";

import { buildPlayerNameResolver } from "./activity-api-player-names.js";

const powerScore: LeaderboardOverallEntry[] = [
  { id: "ai-1", name: "Alden Vale", tiles: 10, incomePerMinute: 1, techs: 1, score: 1, rank: 1 }
];

describe("buildPlayerNameResolver", () => {
  it("resolves a leaderboard id to its display name", () => {
    const nameFor = buildPlayerNameResolver(powerScore);
    expect(nameFor("ai-1")).toBe("Alden Vale");
  });

  it("names barbarian-1 'Planetary Defense', which never appears on the leaderboard", () => {
    const nameFor = buildPlayerNameResolver(powerScore);
    expect(nameFor("barbarian-1")).toBe("Planetary Defense");
  });

  it("names barbarian-1 'Planetary Defense' even when an older world's leaderboard still says 'Barbarians'", () => {
    const nameFor = buildPlayerNameResolver([
      ...powerScore,
      { id: "barbarian-1", name: "Barbarians", tiles: 5, incomePerMinute: 0, techs: 0, score: 1, rank: 2 }
    ]);
    expect(nameFor("barbarian-1")).toBe("Planetary Defense");
  });

  it("falls back to the raw id when the player is unresolvable", () => {
    const nameFor = buildPlayerNameResolver(powerScore);
    expect(nameFor("some-pruned-id")).toBe("some-pruned-id");
  });
});
