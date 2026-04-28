import { describe, expect, it } from "vitest";

import { playerNeedsProfileSetup, resetHumanProfileForSeason } from "./server-player-profile-lifecycle.js";

describe("server player profile lifecycle", () => {
  it("treats only incomplete human players as requiring profile setup", () => {
    expect(playerNeedsProfileSetup({ isAi: false, profileComplete: false })).toBe(true);
    expect(playerNeedsProfileSetup({ isAi: false, profileComplete: true })).toBe(false);
    expect(playerNeedsProfileSetup({ isAi: true, profileComplete: false })).toBe(false);
  });

  it("resets human profiles for a new season without affecting AI players", () => {
    const human = { isAi: false, profileComplete: true };
    const ai = { isAi: true, profileComplete: true };

    resetHumanProfileForSeason(human);
    resetHumanProfileForSeason(ai);

    expect(human.profileComplete).toBe(false);
    expect(ai.profileComplete).toBe(true);
  });
});
