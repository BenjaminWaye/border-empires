import { describe, expect, it } from "vitest";

import { personalizeSeasonVictoryObjectives } from "./personalized-season-victory.js";

describe("personalizeSeasonVictoryObjectives", () => {
  it("preserves global tracker status while restoring the current player's comparison line", () => {
    const personalized = personalizeSeasonVictoryObjectives(
      [
        {
          id: "ECONOMIC_HEGEMONY",
          name: "Economic Ascendancy",
          description: "Lead the world economy.",
          leaderPlayerId: "ai-1",
          leaderName: "Freja Sund",
          progressLabel: "7.0 gold/m vs 6.0",
          thresholdLabel: "Need at least 200 gold/m and 33% lead",
          holdDurationSeconds: 21600,
          statusLabel: "Holding · 5h left",
          holdRemainingSeconds: 18_000,
          conditionMet: true
        }
      ],
      [
        {
          id: "ECONOMIC_HEGEMONY",
          name: "Economic Ascendancy",
          description: "Lead the world economy.",
          leaderPlayerId: "ai-1",
          leaderName: "Freja Sund",
          progressLabel: "7.0 gold/m vs 6.0",
          selfProgressLabel: "5.0 gold/m",
          thresholdLabel: "Need at least 200 gold/m and 33% lead",
          holdDurationSeconds: 21600,
          statusLabel: "Threshold met",
          conditionMet: true
        }
      ]
    );

    expect(personalized).toEqual([
      expect.objectContaining({
        id: "ECONOMIC_HEGEMONY",
        statusLabel: "Holding · 5h left",
        holdRemainingSeconds: 18_000,
        selfProgressLabel: "5.0 gold/m"
      })
    ]);
  });
});
