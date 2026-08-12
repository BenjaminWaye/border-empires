// §20 of the manpower-economy-rewrite plan: server-pushed "what happened
// while I was away" events. These no longer render their own panel — every
// entry is folded into the Activity Feed (see appendFeedEntry usage in
// client-network.ts) so players have one place to look, not two.
import type { FeedSeverity, FeedType } from "./client-types.js";

export type ClientEventLogEntry = { id: string; type: string; text: string; occurredAt: number; x?: number; y?: number };

// How each server event-log type should read in the Activity Feed.
const FEED_MAPPING_BY_EVENT_TYPE: Record<string, { type: FeedType; severity: FeedSeverity }> = {
  TOWN_LOST: { type: "combat", severity: "error" },
  IMPERIAL_EXCHANGE_LEVY_HIT: { type: "combat", severity: "warn" },
  IMPERIAL_EXCHANGE_LEVY_CAST: { type: "combat", severity: "info" },
  MONUMENT_CLAIMED: { type: "tech", severity: "success" },
  MONUMENT_LOST_TO_RIVAL: { type: "combat", severity: "warn" },
  NATURAL_WONDER_CLAIMED: { type: "tech", severity: "success" }
};
const DEFAULT_FEED_MAPPING: { type: FeedType; severity: FeedSeverity } = { type: "info", severity: "info" };

export const feedMappingForEventType = (type: string): { type: FeedType; severity: FeedSeverity } =>
  FEED_MAPPING_BY_EVENT_TYPE[type] ?? DEFAULT_FEED_MAPPING;

export type EventLogFeedEntry = {
  text: string;
  type: FeedType;
  severity: FeedSeverity;
  at: number;
  focusX?: number;
  focusY?: number;
  actionLabel?: string;
};

// Converts a server eventLog entry into the shape appendFeedEntry expects,
// adding a "Go to tile" button whenever the server supplied coordinates.
export const feedEntryForEventLogEntry = (entry: ClientEventLogEntry): EventLogFeedEntry => {
  const { type, severity } = feedMappingForEventType(entry.type);
  return {
    text: entry.text,
    type,
    severity,
    at: entry.occurredAt,
    ...(typeof entry.x === "number" && typeof entry.y === "number"
      ? { focusX: entry.x, focusY: entry.y, actionLabel: "Go to tile" }
      : {})
  };
};
