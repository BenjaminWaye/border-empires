import { describe, expect, it } from "vitest";

import { playerNameForOwnerFromState } from "./client-owner-name.js";
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
});
