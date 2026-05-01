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
          progressLabel: "4/6 islands at 5%+ settled · weakest island 5% (55/1100)",
          selfProgressLabel: "1/6 islands at 5%+ settled",
          thresholdLabel: "Need 5% settled land on every island",
          holdDurationSeconds: 86400,
          statusLabel: "Pressure building",
          conditionMet: false
        }
      ],
      undefined
    );

    expect(html).toContain("You: 3/87 towns");
    expect(html).toContain("You: 12.0 gold/m");
    expect(html).toContain("You: 1/6 islands at 5%+ settled");
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

  it("does not append a duplicate self row when the player is already visible outside first place", () => {
    const html = leaderboardHtml(
      {
        overall: [{ id: "me", rank: 11, name: "Nauticus", score: 4, tiles: 1, incomePerMinute: 1, techs: 0 }],
        selfOverall: { id: "me", rank: 11, name: "Nauticus", score: 4, tiles: 1, incomePerMinute: 1, techs: 0 },
        selfByTiles: { id: "me", rank: 11, name: "Nauticus", value: 1 },
        selfByIncome: { id: "me", rank: 11, name: "Nauticus", value: 1 },
        selfByTechs: { id: "me", rank: 11, name: "Nauticus", value: 0 },
        byTiles: [{ id: "me", rank: 11, name: "Nauticus", value: 1 }],
        byIncome: [{ id: "me", rank: 11, name: "Nauticus", value: 1 }],
        byTechs: [{ id: "me", rank: 11, name: "Nauticus", value: 0 }]
      },
      [],
      undefined
    );

    expect(html).toContain("11. Nauticus | score 4.0 | settled 1 | income 1.0 | tech 0");
    expect(html).not.toContain("11. You | score 4.0 | settled 1 | income 1.0 | tech 0");
    expect(html).not.toContain("11. You (1.0)");
    expect(html).not.toContain("11. You (0.0)");
  });

  it("does not append a duplicate self row when the visible row matches but the ids differ", () => {
    const html = leaderboardHtml(
      {
        overall: [
          { id: "p1", rank: 11, name: "Benjamin Waye", score: 4, tiles: 1, incomePerMinute: 1, techs: 0 },
          { id: "p2", rank: 12, name: "Nauticus", score: 1, tiles: 1, incomePerMinute: 0, techs: 0 }
        ],
        selfOverall: { id: "me", rank: 11, name: "Benjamin Waye", score: 4, tiles: 1, incomePerMinute: 1, techs: 0 },
        selfByTiles: { id: "me", rank: 12, name: "Benjamin Waye", value: 1 },
        selfByIncome: { id: "me", rank: 9, name: "Benjamin Waye", value: 1 },
        selfByTechs: { id: "me", rank: 5, name: "Benjamin Waye", value: 0 },
        byTiles: [
          { id: "p1", rank: 11, name: "Nauticus", value: 1 },
          { id: "p2", rank: 12, name: "Benjamin Waye", value: 1 }
        ],
        byIncome: [
          { id: "p1", rank: 9, name: "Benjamin Waye", value: 1 },
          { id: "p2", rank: 12, name: "Nauticus", value: 0 }
        ],
        byTechs: [
          { id: "p1", rank: 4, name: "Nauticus", value: 0 },
          { id: "p2", rank: 5, name: "Benjamin Waye", value: 0 }
        ]
      },
      [],
      undefined
    );

    expect(html).toContain("11. Benjamin Waye | score 4.0 | settled 1 | income 1.0 | tech 0");
    expect(html).not.toContain("11. You | score 4.0 | settled 1 | income 1.0 | tech 0");
    expect(html).not.toContain("12. You (1.0)");
    expect(html).not.toContain("9. You (1.0)");
    expect(html).not.toContain("5. You (0.0)");
  });

  it("does not append a duplicate self row when only hidden precision differs", () => {
    const html = leaderboardHtml(
      {
        overall: [{ id: "p1", rank: 11, name: "Benjamin Waye", score: 4.04, tiles: 1, incomePerMinute: 1.04, techs: 0 }],
        selfOverall: { id: "me", rank: 11, name: "Benjamin Waye", score: 4.03, tiles: 1, incomePerMinute: 1.03, techs: 0 },
        selfByTiles: undefined,
        selfByIncome: { id: "me", rank: 9, name: "Benjamin Waye", value: 1.04 },
        selfByTechs: { id: "me", rank: 5, name: "Benjamin Waye", value: 0.04 },
        byTiles: [{ id: "p1", rank: 11, name: "Benjamin Waye", value: 1 }],
        byIncome: [{ id: "p1", rank: 9, name: "Benjamin Waye", value: 1.03 }],
        byTechs: [{ id: "p1", rank: 5, name: "Benjamin Waye", value: 0.03 }]
      },
      [],
      undefined
    );

    expect(html).toContain("11. Benjamin Waye | score 4.0 | settled 1 | income 1.0 | tech 0");
    expect(html).not.toContain("11. You | score 4.0 | settled 1 | income 1.0 | tech 0");
    expect(html).not.toContain("9. You (1.0)");
    expect(html).not.toContain("5. You (0.0)");
  });

  it("hides the self row when the player is already the leader", () => {
    const html = leaderboardHtml(
      {
        overall: [{ id: "me", rank: 1, name: "Nauticus", score: 10, tiles: 10, incomePerMinute: 5, techs: 4 }],
        selfOverall: { id: "me", rank: 1, name: "Nauticus", score: 10, tiles: 10, incomePerMinute: 5, techs: 4 },
        selfByTiles: { id: "me", rank: 1, name: "Nauticus", value: 10 },
        selfByIncome: { id: "me", rank: 1, name: "Nauticus", value: 5 },
        selfByTechs: { id: "me", rank: 1, name: "Nauticus", value: 4 },
        byTiles: [{ id: "me", rank: 1, name: "Nauticus", value: 10 }],
        byIncome: [{ id: "me", rank: 1, name: "Nauticus", value: 5 }],
        byTechs: [{ id: "me", rank: 1, name: "Nauticus", value: 4 }]
      },
      [
        {
          id: "TOWN_CONTROL",
          name: "Town Control",
          description: "Hold towns.",
          leaderPlayerId: "me",
          leaderName: "Nauticus",
          progressLabel: "20/87 towns",
          selfProgressLabel: "20/87 towns",
          thresholdLabel: "Need 87 towns",
          holdDurationSeconds: 86400,
          statusLabel: "Pressure building",
          conditionMet: false
        }
      ],
      undefined
    );

    expect(html).not.toContain("1. You | score 10.0");
    expect(html).not.toContain("1. You (10.0)");
    expect(html).not.toContain("1. You (5.0)");
    expect(html).not.toContain("1. You (4.0)");
    expect(html).not.toContain("You: 20/87 towns");
  });
});
