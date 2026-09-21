import { describe, expect, it } from "vitest";
import { feedMappingForEventType, seedFeedFromEventLog, type ClientEventLogEntry } from "./client-event-log-html.js";
import type { FeedEntry } from "./client-types.js";

describe("feedMappingForEventType", () => {
  it("maps known server event-log types to a feed type/severity", () => {
    expect(feedMappingForEventType("TOWN_LOST")).toEqual({ type: "combat", severity: "error" });
    expect(feedMappingForEventType("IMPERIAL_EXCHANGE_LEVY_HIT")).toEqual({ type: "combat", severity: "warn" });
    expect(feedMappingForEventType("IMPERIAL_EXCHANGE_LEVY_CAST")).toEqual({ type: "combat", severity: "info" });
    expect(feedMappingForEventType("MONUMENT_CLAIMED")).toEqual({ type: "tech", severity: "success" });
    expect(feedMappingForEventType("MONUMENT_LOST_TO_RIVAL")).toEqual({ type: "combat", severity: "warn" });
    expect(feedMappingForEventType("MONUMENT_CONSTRUCTION_STARTED")).toEqual({ type: "tech", severity: "info" });
    expect(feedMappingForEventType("NATURAL_WONDER_CLAIMED")).toEqual({ type: "tech", severity: "success" });
  });

  it("falls back to info/info for unknown event types", () => {
    expect(feedMappingForEventType("SOME_FUTURE_EVENT_TYPE")).toEqual({ type: "info", severity: "info" });
  });
});

describe("seedFeedFromEventLog", () => {
  const entryAt = (id: string, occurredAt: number): ClientEventLogEntry => ({ id, type: "TOWN_LOST", text: id, occurredAt });

  it("backfills entries within the last 24h, newest first, marked unread", () => {
    const nowMs = 1_000_000_000_000;
    const dayMs = 24 * 60 * 60 * 1000;
    const state = { feed: [] as FeedEntry[] };
    const log = [entryAt("too-old", nowMs - dayMs - 1), entryAt("older", nowMs - 1_000), entryAt("newer", nowMs - 500)];

    seedFeedFromEventLog(state, log, nowMs);

    expect(state.feed.map((entry) => entry.text)).toEqual(["newer", "older"]);
    expect(state.feed.every((entry) => entry.unread)).toBe(true);
  });

  it("does nothing when the event log has no recent entries", () => {
    const nowMs = 1_000_000_000_000;
    const state = { feed: [] as FeedEntry[] };

    seedFeedFromEventLog(state, [entryAt("ancient", 0)], nowMs);

    expect(state.feed).toEqual([]);
  });
});
