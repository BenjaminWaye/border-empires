import { describe, expect, it } from "vitest";
import { feedMappingForEventType } from "./client-event-log-html.js";

describe("feedMappingForEventType", () => {
  it("maps known server event-log types to a feed type/severity", () => {
    expect(feedMappingForEventType("TOWN_LOST")).toEqual({ type: "combat", severity: "error" });
    expect(feedMappingForEventType("IMPERIAL_EXCHANGE_LEVY_HIT")).toEqual({ type: "combat", severity: "warn" });
    expect(feedMappingForEventType("IMPERIAL_EXCHANGE_LEVY_CAST")).toEqual({ type: "combat", severity: "info" });
    expect(feedMappingForEventType("MONUMENT_CLAIMED")).toEqual({ type: "tech", severity: "success" });
    expect(feedMappingForEventType("MONUMENT_LOST_TO_RIVAL")).toEqual({ type: "combat", severity: "warn" });
    expect(feedMappingForEventType("NATURAL_WONDER_CLAIMED")).toEqual({ type: "tech", severity: "success" });
  });

  it("falls back to info/info for unknown event types", () => {
    expect(feedMappingForEventType("SOME_FUTURE_EVENT_TYPE")).toEqual({ type: "info", severity: "info" });
  });
});
