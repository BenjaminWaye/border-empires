import { describe, expect, it } from "vitest";

import { activeTrucesHtml, allianceRequestsHtml, alliesHtml, feedHtml, truceRequestsHtml } from "./client-panel-html.js";

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

  it("renders redesigned alliance cards with reject actions and timestamps", () => {
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
    expect(html).toContain("Reject");
    expect(html).toContain('data-request-id="request-1"');
  });

  it("renders active allies and truces in the new status-card format", () => {
    const alliesMarkup = alliesHtml(["player-42"], (id) => (id === "player-42" ? "SteamLord" : undefined));
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
    expect(trucesMarkup).toContain("IronFist");
    expect(trucesMarkup).toContain("18h");
    expect(trucesMarkup).toContain("remaining");
  });

  it("renders truce requests with accept and reject actions", () => {
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
      Date.UTC(2026, 3, 13, 11, 0, 0)
    );

    expect(html).toContain("GearHeart");
    expect(html).toContain("24h");
    expect(html).toContain("Reject");
    expect(html).toContain('data-truce-request-id="truce-1"');
  });
});
