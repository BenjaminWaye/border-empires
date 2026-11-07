import { describe, expect, it } from "vitest";

import { allianceRequestsHtml, alliesHtml, feedAgeLabel, feedHtml, leaderboardHtml, socialRemainingLabel, truceRequestsHtml } from "./client-panel-html.js";

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

  it("renders incoming alliance cards with accept and reject actions", () => {
    const html = allianceRequestsHtml(
      [
        {
          id: "request-1",
          fromPlayerId: "player-201",
          toPlayerId: "me",
          createdAt: Date.UTC(2026, 3, 13, 10, 0, 0),
          expiresAt: Date.UTC(2026, 3, 13, 11, 0, 0),
          fromName: "BrassKnight"
        }
      ],
      () => undefined,
      "incoming",
      Date.UTC(2026, 3, 13, 11, 0, 0)
    );

    expect(html).toContain("BrassKnight");
    expect(html).toContain("Offers an alliance");
    expect(html).not.toContain("ID:");
    expect(html).toContain("1h ago");
    expect(html).toContain("Sent by:");
    expect(html).toContain("Waiting on:");
    expect(html).toContain("Reject");
    expect(html).toContain('data-request-id="request-1"');
  });

  it("renders outgoing alliance cards with a cancel action", () => {
    const html = allianceRequestsHtml(
      [
        {
          id: "request-2",
          fromPlayerId: "me",
          toPlayerId: "player-305",
          createdAt: Date.UTC(2026, 3, 13, 8, 0, 0),
          expiresAt: Date.UTC(2026, 3, 13, 9, 0, 0),
          toName: "SteelForge"
        }
      ],
      () => undefined,
      "outgoing",
      Date.UTC(2026, 3, 13, 11, 0, 0)
    );

    expect(html).toContain("SteelForge");
    expect(html).toContain("You offered an alliance");
    expect(html).toContain("Cancel Request");
    expect(html).toContain("Waiting on:");
  });

  it("renders active allies in the status-card format", () => {
    const alliesMarkup = alliesHtml(["player-42"], (id) => (id === "player-42" ? "SteamLord" : undefined));
    const breakingAlliesMarkup = alliesHtml(
      ["player-42"],
      (id) => (id === "player-42" ? "SteamLord" : undefined),
      [
        {
          otherPlayerId: "player-42",
          otherPlayerName: "SteamLord",
          startedAt: Date.UTC(2026, 3, 13, 8, 0, 0),
          endsAt: Date.UTC(2026, 3, 14, 8, 0, 0),
          createdByPlayerId: "me"
        }
      ],
      Date.UTC(2026, 3, 13, 12, 0, 0)
    );
    expect(alliesMarkup).toContain("SteamLord");
    expect(alliesMarkup).toContain("Active");
    expect(alliesMarkup).not.toContain("ID:");
    expect(alliesMarkup).toContain("Break Alliance");
    expect(breakingAlliesMarkup).toContain("Breaking");
    expect(breakingAlliesMarkup).toContain("20h notice");
    expect(breakingAlliesMarkup).not.toContain("Break Alliance");
    const finalizingAlliesMarkup = alliesHtml(
      ["player-42"],
      (id) => (id === "player-42" ? "SteamLord" : undefined),
      [
        {
          otherPlayerId: "player-42",
          otherPlayerName: "SteamLord",
          startedAt: Date.UTC(2026, 3, 13, 8, 0, 0),
          endsAt: Date.UTC(2026, 3, 14, 8, 0, 0),
          createdByPlayerId: "me"
        }
      ],
      Date.UTC(2026, 3, 14, 8, 0, 1)
    );
    expect(finalizingAlliesMarkup).toContain("Finalizing");
    expect(finalizingAlliesMarkup).toContain("sync pending");
    expect(finalizingAlliesMarkup).not.toContain("Break Alliance");
  });

  it("renders incoming truce requests with accept and reject actions", () => {
    const html = truceRequestsHtml(
      [
        {
          id: "truce-1",
          fromPlayerId: "player-156",
          toPlayerId: "me",
          createdAt: Date.UTC(2026, 3, 13, 10, 0, 0),
          expiresAt: Date.UTC(2026, 3, 13, 11, 0, 0),
          durationHours: 24
        }
      ],
      (id) => (id === "player-156" ? "GearHeart" : undefined),
      "incoming",
      Date.UTC(2026, 3, 13, 11, 0, 0)
    );

    expect(html).toContain("GearHeart");
    expect(html).toContain("Offers a 24h truce");
    expect(html).not.toContain("ID:");
    expect(html).toContain("Reject");
    expect(html).toContain('data-truce-request-id="truce-1"');
  });

  it("renders outgoing truce requests with a cancel action", () => {
    const html = truceRequestsHtml(
      [
        {
          id: "truce-2",
          fromPlayerId: "me",
          toPlayerId: "player-421",
          createdAt: Date.UTC(2026, 3, 13, 10, 0, 0),
          expiresAt: Date.UTC(2026, 3, 13, 11, 0, 0),
          durationHours: 12,
          toName: "CopperWing"
        }
      ],
      () => undefined,
      "outgoing",
      Date.UTC(2026, 3, 13, 11, 0, 0)
    );

    expect(html).toContain("CopperWing");
    expect(html).toContain("You offered a 12h truce");
    expect(html).toContain("Cancel Request");
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

describe("socialRemainingLabel", () => {
  const MIN = 60_000;
  it("shows whole hours, rounded up, from an hour out", () => {
    expect(socialRemainingLabel(24 * 60 * MIN, 0)).toBe("24h");
    expect(socialRemainingLabel(61 * MIN, 0)).toBe("2h");
    expect(socialRemainingLabel(59 * MIN + 1, 0)).toBe("1h");
  });

  it("counts down in minutes in the last hour, never below 1m", () => {
    expect(socialRemainingLabel(42 * MIN, 0)).toBe("42m");
    expect(socialRemainingLabel(41 * MIN + 1, 0)).toBe("42m");
    expect(socialRemainingLabel(30_000, 0)).toBe("1m");
  });
});
