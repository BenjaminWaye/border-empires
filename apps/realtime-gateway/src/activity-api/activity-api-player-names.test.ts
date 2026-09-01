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

  it("falls back to 'Barbarians' for barbarian-1, which never appears on the leaderboard", () => {
    const nameFor = buildPlayerNameResolver(powerScore);
    expect(nameFor("barbarian-1")).toBe("Barbarians");
  });

  it("falls back to the raw id when the player is unresolvable", () => {
    const nameFor = buildPlayerNameResolver(powerScore);
    expect(nameFor("some-pruned-id")).toBe("some-pruned-id");
  });
});
