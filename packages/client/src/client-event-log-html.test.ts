import { describe, expect, it } from "vitest";
import { eventLogIconForType, renderEventLogPanelHtml } from "./client-event-log-html.js";

describe("eventLogIconForType", () => {
  it("maps known event types to distinct icons", () => {
    expect(eventLogIconForType("TOWN_LOST")).toBe("🏚️");
    expect(eventLogIconForType("IMPERIAL_EXCHANGE_LEVY_HIT")).toBe("💰");
    expect(eventLogIconForType("IMPERIAL_EXCHANGE_LEVY_CAST")).toBe("🪙");
  });

  it("falls back to a generic icon for an unrecognized type", () => {
    expect(eventLogIconForType("SOME_FUTURE_EVENT_TYPE")).toBe("•");
  });
});

describe("renderEventLogPanelHtml", () => {
  it("shows an empty-state message when there are no entries", () => {
    const html = renderEventLogPanelHtml([], 0);
    expect(html).toContain("Nothing has happened yet");
    expect(html).not.toContain("event-log-list");
  });

  it("renders most-recent-first even though input is most-recent-last", () => {
    const html = renderEventLogPanelHtml(
      [
        { id: "1", type: "TOWN_LOST", text: "Old Town was captured by Rival.", occurredAt: 1_000 },
        { id: "2", type: "IMPERIAL_EXCHANGE_LEVY_HIT", text: "You were hit for 50 gold.", occurredAt: 2_000 }
      ],
      2_000
    );
    const hitIndex = html.indexOf("You were hit for 50 gold.");
    const lostIndex = html.indexOf("Old Town was captured by Rival.");
    expect(hitIndex).toBeGreaterThan(-1);
    expect(lostIndex).toBeGreaterThan(-1);
    expect(hitIndex).toBeLessThan(lostIndex);
  });

  it("escapes text content to avoid HTML injection from town/player names", () => {
    const html = renderEventLogPanelHtml(
      [{ id: "1", type: "TOWN_LOST", text: "<script>alert(1)</script> was captured by X.", occurredAt: 0 }],
      0
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("formats relative timestamps", () => {
    const now = 10 * 60_000;
    const html = renderEventLogPanelHtml([{ id: "1", type: "TOWN_LOST", text: "Town lost.", occurredAt: 0 }], now);
    expect(html).toContain("10m ago");
  });
});
