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
        byTiles: [],
        byIncome: [],
        byTechs: []
      },
      [
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

    expect(html).toContain("You: 1/6 islands at 10%+ settled");
    expect(html).toContain("44. You | score 1.0 | settled 1 | income 1.0 | tech 1");
  });
});
