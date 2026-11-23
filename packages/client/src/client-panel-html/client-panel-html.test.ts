import { describe, expect, it } from "vitest";

import { feedAgeLabel, feedHtml, leaderboardHtml, socialRemainingLabel } from "./client-panel-html.js";

describe("feedAgeLabel", () => {
  const now = Date.UTC(2026, 7, 12, 12, 0, 0);

  it("scales through seconds, minutes, hours, days, weeks, and months instead of raw minutes forever", () => {
    expect(feedAgeLabel(now - 30 * 1000, now)).toBe("30s");
    expect(feedAgeLabel(now - 45 * 60_000, now)).toBe("45m");
    expect(feedAgeLabel(now - 388 * 60_000, now)).toBe("6h");
    expect(feedAgeLabel(now - 833 * 60_000, now)).toBe("13h");
    expect(feedAgeLabel(now - 3 * 24 * 60 * 60_000, now)).toBe("3d");
    expect(feedAgeLabel(now - 10 * 24 * 60 * 60_000, now)).toBe("1w");
    expect(feedAgeLabel(now - 45 * 24 * 60 * 60_000, now)).toBe("1mo");
  });
});

describe("feedHtml", () => {
  it("renders a focus button for feed entries with tile coordinates", () => {
    const html = feedHtml([
      {
        title: "Town Lost",
        text: "Aetherwick was captured by Red Empire.",
        type: "combat",
        severity: "error",
        at: Date.now() - 1000,
        focusX: 18,
        focusY: 42,
        actionLabel: "Center"
      }
    ]);

    expect(html).toContain("Town Lost");
    expect(html).toContain('data-feed-focus-x="18"');
    expect(html).toContain('data-feed-focus-y="42"');
    expect(html).toContain(">Center<");
  });

  it("renders admin tile debug controls when enabled for the viewer", () => {
    const html = feedHtml([], {
      visible: true,
      enabled: false,
      selectedTileKey: "78,322"
    });

    expect(html).toContain("Admin Tile Debug");
    expect(html).toContain("Target: 78,322");
    expect(html).toContain('data-debug-tile-toggle="1"');
    expect(html).toContain("Debug Selected Tile");
  });
});

describe("leaderboardHtml", () => {
  const emptyLeaderboard = {
    overall: [] as never[],
    selfOverall: undefined,
    selfByTiles: undefined,
    selfByIncome: undefined,
    selfByTechs: undefined,
    byTiles: [] as never[],
    byIncome: [] as never[],
    byTechs: [] as never[]
  };

  it("shows the founding-engineer badge for their overall row, keyed on player id not display name", () => {
    const html = leaderboardHtml(
      {
        ...emptyLeaderboard,
        overall: [
          { id: "VK5iriJAhickNf9ArrRweUDnq1W2", name: "KonradsDelikatessKörv", rank: 1, score: 42, tiles: 10, incomePerMinute: 5, techs: 3, manpowerCap: 250 },
          { id: "some-other-player", name: "KonradsDelikatessKörv", rank: 2, score: 30, tiles: 8, incomePerMinute: 4, techs: 2, manpowerCap: 200 }
        ]
      },
      [],
      undefined
    );
    const rows = html.split("</div>").filter((row) => row.includes("KonradsDelikatessKörv"));
    expect(rows[0]).toContain("founding-engineer-name");
    expect(rows[1]).not.toContain("founding-engineer-name");
  });
});

describe("leaderboardHtml victory leader", () => {
  const board = {
    overall: [{ id: "ai-1", name: "Alden", rank: 1, score: 42, tiles: 10, incomePerMinute: 5, techs: 3, manpowerCap: 250 }],
    selfOverall: undefined, selfByTiles: undefined, selfByIncome: undefined, selfByTechs: undefined,
    byTiles: [] as never[], byIncome: [] as never[], byTechs: [] as never[]
  };
  const dominance = (leaderName: string) => ({
    id: "DIPLOMATIC_DOMINANCE" as const, name: "Diplomatic Dominance", description: "", leaderPlayerId: "ai-1", leaderName,
    progressLabel: "4832/57254", thresholdLabel: "", holdDurationSeconds: 0, statusLabel: "", conditionMet: false
  });

  // Playtest Run 4: a live update with a blank leaderName printed "Leader: · 4832/57254".
  it("names the leader from the leaderboard when the objective's leader name is blank", () => {
    const html = leaderboardHtml(board, [dominance("")], undefined);
    expect(html).toMatch(/Leader: .*Alden.* · 4832\/57254/);
  });

  it("keeps the objective's own leader name when it has one", () => {
    expect(leaderboardHtml(board, [dominance("Alden of Vey")], undefined)).toContain("Alden of Vey");
  });
});

describe("socialRemainingLabel", () => {
  const MIN = 60_000;
  it("shows hours and leftover minutes from an hour out, not rounding up to the next hour", () => {
    expect(socialRemainingLabel(24 * 60 * MIN, 0)).toBe("24h");
    expect(socialRemainingLabel(61 * MIN, 0)).toBe("1h 1m");
    expect(socialRemainingLabel(83 * MIN, 0)).toBe("1h 23m");
    expect(socialRemainingLabel(119 * MIN + 1, 0)).toBe("2h");
    expect(socialRemainingLabel(59 * MIN + 1, 0)).toBe("1h");
  });

  it("counts down in minutes in the last hour, never below 1m", () => {
    expect(socialRemainingLabel(42 * MIN, 0)).toBe("42m");
    expect(socialRemainingLabel(41 * MIN + 1, 0)).toBe("42m");
    expect(socialRemainingLabel(30_000, 0)).toBe("1m");
  });
});
