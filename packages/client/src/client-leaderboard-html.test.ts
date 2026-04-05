import { describe, expect, it } from "vitest";
import { leaderboardHtml } from "./client-panel-html.js";

describe("leaderboard and season victory rendering", () => {
  it("shows player comparison lines for seasonal objectives and appends the self row when outside the top five", () => {
    const html = leaderboardHtml(
      {
        overall: [
          { id: "p1", rank: 1, name: "Alpha", score: 10, tiles: 10, incomePerMinute: 5, techs: 1 },
          { id: "p2", rank: 2, name: "Beta", score: 9, tiles: 9, incomePerMinute: 4, techs: 1 }
        ],
        selfOverall: { id: "me", rank: 44, name: "Nauticus", score: 1, tiles: 1, incomePerMinute: 1, techs: 1 },
        selfByTiles: { id: "me", rank: 11, name: "Nauticus", value: 7 },
        selfByIncome: { id: "me", rank: 8, name: "Nauticus", value: 3.5 },
        selfByTechs: { id: "me", rank: 13, name: "Nauticus", value: 2 },
        byTiles: [{ id: "p1", rank: 1, name: "Alpha", value: 10 }],
        byIncome: [{ id: "p1", rank: 1, name: "Alpha", value: 5 }],
        byTechs: [{ id: "p1", rank: 1, name: "Alpha", value: 4 }]
      },
      [
        {
          id: "TOWN_CONTROL",
          name: "Town Control",
          description: "Hold towns.",
          leaderName: "Ivan",
          progressLabel: "20/87 towns",
          selfProgressLabel: "3/87 towns",
          thresholdLabel: "Need 87 towns",
          holdDurationSeconds: 86400,
          statusLabel: "Pressure building",
          conditionMet: false
        },
        {
          id: "ECONOMIC_HEGEMONY",
          name: "Economy",
          description: "Reach gold.",
          leaderName: "Ivan",
          progressLabel: "59.7 gold/m vs 47.4",
          selfProgressLabel: "12.0 gold/m",
          thresholdLabel: "Need at least 200 gold/m and 33% lead",
          holdDurationSeconds: 86400,
          statusLabel: "Pressure building",
          conditionMet: false
        },
        {
          id: "CONTINENT_FOOTPRINT",
          name: "Continental Footprint",
          description: "Hold islands.",
          leaderName: "Ivan",
          progressLabel: "4/6 islands at 10%+ settled · weakest island 10% (110/1100)",
          selfProgressLabel: "1/6 islands at 10%+ settled",
          thresholdLabel: "Need 10% settled land on every island",
          holdDurationSeconds: 86400,
          statusLabel: "Pressure building",
          conditionMet: false
        }
      ],
      undefined
    );

    expect(html).toContain("You: 3/87 towns");
    expect(html).toContain("You: 12.0 gold/m");
    expect(html).toContain("You: 1/6 islands at 10%+ settled");
    expect(html).toContain("44. You | score 1.0 | settled 1 | income 1.0 | tech 1");
    expect(html).toContain("11. You (7.0)");
    expect(html).toContain("8. You (3.5)");
    expect(html).toContain("13. You (2.0)");
  });

  it("does not duplicate self metric rows when the player is already in the visible top five", () => {
    const html = leaderboardHtml(
      {
        overall: [{ id: "me", rank: 1, name: "Nauticus", score: 10, tiles: 10, incomePerMinute: 5, techs: 4 }],
        selfOverall: undefined,
        selfByTiles: undefined,
        selfByIncome: undefined,
        selfByTechs: undefined,
        byTiles: [{ id: "me", rank: 1, name: "Nauticus", value: 10 }],
        byIncome: [{ id: "me", rank: 1, name: "Nauticus", value: 5 }],
        byTechs: [{ id: "me", rank: 1, name: "Nauticus", value: 4 }]
      },
      [],
      undefined
    );

    expect(html).not.toContain("1. You (10.0)");
    expect(html).not.toContain("1. You (5.0)");
    expect(html).not.toContain("1. You (4.0)");
  });
});
