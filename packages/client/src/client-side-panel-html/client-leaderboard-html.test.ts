import { describe, expect, it } from "vitest";
import { leaderboardHtml } from "../client-panel-html/client-panel-html.js";

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
          id: "MARITIME_SUPREMACY",
          name: "Maritime Supremacy",
          description: "Hold docks.",
          leaderName: "Ivan",
          progressLabel: "4/6 docks",
          selfProgressLabel: "1/6 docks",
          thresholdLabel: "Need 6 settled docks (55% of world docks)",
          holdDurationSeconds: 86400,
          statusLabel: "Pressure building",
          conditionMet: false
        }
      ],
      undefined,
      new Map([
        ["p1", "#38b000"],
        ["p2", "#3b82f6"],
        ["me", "#ef4444"]
      ])
    );

    expect(html).toContain("You: 3/87 towns");
    expect(html).toContain("You: 12.0 gold/m");
    expect(html).toContain("You: 1/6 docks");
    expect(html).toContain("44. <span class=\"lb-player-name\"><span class=\"lb-player-dot\" style=\"--player-color:#ef4444\" aria-hidden=\"true\"></span><span>You</span></span> | score 1.0 | settled 1 | income 1.0 | tech 1");
    expect(html).toContain("11. <span class=\"lb-player-name\"><span class=\"lb-player-dot\" style=\"--player-color:#ef4444\" aria-hidden=\"true\"></span><span>You</span></span> (7.0)");
    expect(html).toContain("8. <span class=\"lb-player-name\"><span class=\"lb-player-dot\" style=\"--player-color:#ef4444\" aria-hidden=\"true\"></span><span>You</span></span> (3.5)");
    expect(html).toContain("13. <span class=\"lb-player-name\"><span class=\"lb-player-dot\" style=\"--player-color:#ef4444\" aria-hidden=\"true\"></span><span>You</span></span> (2.0)");
    expect(html).toContain("<span class=\"lb-player-dot\" style=\"--player-color:#38b000\" aria-hidden=\"true\"></span><span>Alpha</span>");
  });

  it("shows a hold countdown line when an objective's threshold is met and holding", () => {
    const html = leaderboardHtml(
      {
        overall: [],
        selfOverall: undefined,
        selfByTiles: undefined,
        selfByIncome: undefined,
        selfByTechs: undefined,
        byTiles: [],
        byIncome: [],
        byTechs: []
      },
      [
        {
          id: "TOWN_CONTROL",
          name: "Town Control",
          description: "Hold towns.",
          leaderPlayerId: "p1",
          leaderName: "Ivan",
          progressLabel: "87/87 towns",
          thresholdLabel: "Need 87 towns",
          holdDurationSeconds: 86_400,
          holdRemainingSeconds: 86_280,
          statusLabel: "Holding pressure",
          conditionMet: true
        }
      ],
      undefined
    );

    expect(html).toContain("Winning in 23h 58m unless stopped");
  });

  it("omits the hold countdown line when the objective has no active hold", () => {
    const html = leaderboardHtml(
      {
        overall: [],
        selfOverall: undefined,
        selfByTiles: undefined,
        selfByIncome: undefined,
        selfByTechs: undefined,
        byTiles: [],
        byIncome: [],
        byTechs: []
      },
      [
        {
          id: "TOWN_CONTROL",
          name: "Town Control",
          description: "Hold towns.",
          leaderName: "Ivan",
          progressLabel: "20/87 towns",
          thresholdLabel: "Need 87 towns",
          holdDurationSeconds: 86_400,
          statusLabel: "Pressure building",
          conditionMet: false
        }
      ],
      undefined
    );

    expect(html).not.toContain("Winning in");
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

    expect(html).toContain(
      '11. <span class="lb-player-name"><span class="lb-player-dot is-unknown" aria-hidden="true"></span><span>Nauticus</span></span> | score 4.0 | settled 1 | income 1.0 | tech 0'
    );
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

    expect(html).toContain(
      '11. <span class="lb-player-name"><span class="lb-player-dot is-unknown" aria-hidden="true"></span><span>Benjamin Waye</span></span> | score 4.0 | settled 1 | income 1.0 | tech 0'
    );
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

    expect(html).toContain(
      '11. <span class="lb-player-name"><span class="lb-player-dot is-unknown" aria-hidden="true"></span><span>Benjamin Waye</span></span> | score 4.0 | settled 1 | income 1.0 | tech 0'
    );
    expect(html).not.toContain("11. You | score 4.0 | settled 1 | income 1.0 | tech 0");
    expect(html).not.toContain("9. You (1.0)");
    expect(html).not.toContain("5. You (0.0)");
  });

  it("labels season objective leaders as You when the current player is already the leader", () => {
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
    expect(html).toContain("Leader: <span class=\"lb-player-name\"><span class=\"lb-player-dot is-unknown\" aria-hidden=\"true\"></span><span>You</span></span> · 20/87 towns");
    expect(html).not.toContain("Leader: <span class=\"lb-player-name\"><span class=\"lb-player-dot is-unknown\" aria-hidden=\"true\"></span><span>Nauticus</span></span> · 20/87 towns");
  });

  it("labels the season winner as You when the current player won", () => {
    const html = leaderboardHtml(
      {
        overall: [],
        selfOverall: { id: "player-auth-1", rank: 12, name: "Nauticus", score: 1, tiles: 1, incomePerMinute: 1, techs: 0 },
        selfByTiles: undefined,
        selfByIncome: undefined,
        selfByTechs: undefined,
        byTiles: [],
        byIncome: [],
        byTechs: []
      },
      [],
      {
        playerId: "player-auth-1",
        playerName: "Nauticus",
        objectiveId: "TOWN_CONTROL",
        objectiveName: "Town Control",
        crownedAt: 1700000000000
      },
      new Map([["player-auth-1", "#ef4444"]])
    );

    expect(html).toContain(
      '<span class="pressure-name"><span class="lb-player-name"><span class="lb-player-dot" style="--player-color:#ef4444" aria-hidden="true"></span><span>You</span></span></span>'
    );
    expect(html).not.toContain("<span>Nauticus</span></span></span>");
  });

  it("shows a neutral dot when a player color is unavailable", () => {
    const html = leaderboardHtml(
      {
        overall: [{ id: "p1", rank: 1, name: "Gray Banner", score: 10, tiles: 10, incomePerMinute: 5, techs: 4 }],
        selfOverall: undefined,
        selfByTiles: undefined,
        selfByIncome: undefined,
        selfByTechs: undefined,
        byTiles: [],
        byIncome: [],
        byTechs: []
      },
      [],
      undefined
    );

    expect(html).toContain('<span class="lb-player-dot is-unknown" aria-hidden="true"></span><span>Gray Banner</span>');
  });

  it("does not show a fake player-color dot for contested season leaders", () => {
    const html = leaderboardHtml(
      {
        overall: [],
        selfOverall: undefined,
        selfByTiles: undefined,
        selfByIncome: undefined,
        selfByTechs: undefined,
        byTiles: [],
        byIncome: [],
        byTechs: []
      },
      [
        {
          id: "RESOURCE_MONOPOLY",
          name: "Resource Monopoly",
          description: "Control enough of one resource type.",
          leaderName: "Contested",
          progressLabel: "6/12 IRON",
          thresholdLabel: "Need 66% of a live resource",
          holdDurationSeconds: 86400,
          statusLabel: "No clear leader",
          conditionMet: false
        }
      ],
      undefined,
      new Map([["p1", "#38b000"]])
    );

    expect(html).toContain("Leader: Contested · 6/12 IRON");
    expect(html).not.toContain('Leader: <span class="lb-player-name">');
  });
});
