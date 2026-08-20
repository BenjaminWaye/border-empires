import { describe, expect, it } from "vitest";

import { activeTrucesHtml, allianceRequestsHtml, alliesHtml, feedAgeLabel, feedHtml, strategicRibbonHtml, truceRequestsHtml } from "./client-panel-html.js";

const emptyStrategic = { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 };
const emptyAnim = {
  FOOD: { until: 0, dir: 0 as const },
  TITANIUM: { until: 0, dir: 0 as const },
  CRYSTAL: { until: 0, dir: 0 as const },
  UMBRITE: { until: 0, dir: 0 as const },
  SHARD: { until: 0, dir: 0 as const }
};

describe("strategicRibbonHtml", () => {
  // Regression coverage for a real bug: the resource ribbon showed TITANIUM/
  // CRYSTAL/UMBRITE pills unconditionally, revealing that those resource
  // categories exist before the player has researched the tech that reveals
  // them server-side. The ribbon now takes an isRevealed callback and omits
  // pills for categories that aren't revealed yet.
  it("hides TITANIUM/CRYSTAL/UMBRITE pills when not revealed, always shows FOOD", () => {
    const html = strategicRibbonHtml(
      emptyStrategic,
      emptyStrategic,
      { food: 0, titanium: 0, umbrite: 0, crystal: 0, gold: 0 },
      emptyAnim,
      () => "",
      undefined,
      (key) => key === "FOOD"
    );
    expect(html).toContain("data-economy-open=\"FOOD\"");
    expect(html).not.toContain("data-economy-open=\"TITANIUM\"");
    expect(html).not.toContain("data-economy-open=\"CRYSTAL\"");
    expect(html).not.toContain("data-economy-open=\"UMBRITE\"");
  });

  it("shows all pills when isRevealed is omitted (backward compatible)", () => {
    const html = strategicRibbonHtml(emptyStrategic, emptyStrategic, { food: 0, titanium: 0, umbrite: 0, crystal: 0, gold: 0 }, emptyAnim, () => "");
    expect(html).toContain("data-economy-open=\"FOOD\"");
    expect(html).toContain("data-economy-open=\"TITANIUM\"");
    expect(html).toContain("data-economy-open=\"CRYSTAL\"");
    expect(html).toContain("data-economy-open=\"UMBRITE\"");
  });
});

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
    expect(html).toContain("Cancel Request");
    expect(html).toContain("Waiting on:");
  });

  it("renders active allies and truces in the new status-card format", () => {
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
    const trucesMarkup = activeTrucesHtml(
      [
        {
          otherPlayerId: "player-89",
          otherPlayerName: "IronFist",
          startedAt: Date.UTC(2026, 3, 13, 6, 0, 0),
          endsAt: Date.UTC(2026, 3, 14, 6, 0, 0),
          createdByPlayerId: "player-89"
        }
      ],
      () => undefined,
      Date.UTC(2026, 3, 13, 12, 0, 0)
    );

    expect(alliesMarkup).toContain("SteamLord");
    expect(alliesMarkup).toContain("Active");
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
    expect(trucesMarkup).toContain("IronFist");
    expect(trucesMarkup).toContain("18h");
    expect(trucesMarkup).toContain("remaining");
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
    expect(html).toContain("24h");
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
    expect(html).toContain("12h");
    expect(html).toContain("Cancel Request");
  });
});
