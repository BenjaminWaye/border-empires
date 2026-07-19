import { describe, expect, it } from "vitest";

import { playerDisplayNameForOwnerFromState, playerNameForOwnerFromState } from "./client-owner-name.js";
import { createInitialState } from "../client-state/client-state.js";

describe("playerNameForOwnerFromState", () => {
  it("falls back to leaderboard names when player style names are missing", () => {
    const state = createInitialState();
    state.leaderboard.overall = [
      {
        id: "ai8",
        name: "Jack Jill",
        rank: 1,
        score: 99,
        tiles: 25,
        incomePerMinute: 8,
        techs: 4
      }
    ];

    expect(playerNameForOwnerFromState(state, "ai8")).toBe("Jack Jill");
  });

  it("prefers the cosmetic 'AI N' playerNames entry over the leaderboard's seasonal name, so truce/alliance targets stay resolvable", () => {
    const state = createInitialState();
    state.playerNames.set("ai-8", "AI 8");
    state.leaderboard.overall = [
      { id: "ai-8", name: "Freja Sund", rank: 1, score: 99, tiles: 25, incomePerMinute: 8, techs: 4 }
    ];

    expect(playerNameForOwnerFromState(state, "ai-8")).toBe("AI 8");
  });
});

describe("playerDisplayNameForOwnerFromState", () => {
  it("prefers the leaderboard's seasonal name over the cosmetic 'AI N' playerNames entry, for display only", () => {
    const state = createInitialState();
    state.playerNames.set("ai-8", "AI 8");
    state.leaderboard.overall = [
      { id: "ai-8", name: "Freja Sund", rank: 1, score: 99, tiles: 25, incomePerMinute: 8, techs: 4 }
    ];

    expect(playerDisplayNameForOwnerFromState(state, "ai-8")).toBe("Freja Sund");
  });

  it("falls back to playerNames when the owner has no leaderboard entry", () => {
    const state = createInitialState();
    state.playerNames.set("player-2", "Custom Name");

    expect(playerDisplayNameForOwnerFromState(state, "player-2")).toBe("Custom Name");
  });
});
