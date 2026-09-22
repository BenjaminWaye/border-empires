// §20 of the manpower-economy-rewrite plan: server-pushed "what happened
// while I was away" events. These no longer render their own panel — every
// entry is folded into the Activity Feed (see appendFeedEntry usage in
// client-network.ts) so players have one place to look, not two.
import { pushFeedEntry, type FeedMutableState } from "./client-alerts/client-alerts.js";
import { occupationSurveyController } from "./client-occupation-survey.js";
import type { FeedSeverity, FeedType } from "./client-types.js";

export type ClientEventLogEntry = {
  id: string;
  type: string;
  text: string;
  occurredAt: number;
  x?: number;
  y?: number;
  // WAYSTATION_ACTIVATED only -- see client-waystation-activation-catchup.ts,
  // which reads these to render the same rich popup a live activation gets.
  grantedEffect?: "VISION" | "POPULATION" | "TECH" | "RESOURCE_SLOT";
  revealedAtX?: number;
  revealedAtY?: number;
  grantedTechId?: string;
  grantedResource?: "FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE";
  grantedTownName?: string;
  grantedTownX?: number;
  grantedTownY?: number;
  surveyResource?: "TITANIUM" | "UMBRITE" | "GEMS";
  surveySignature?: "BLACKWOOD_CANOPY" | "FERROUS_DUST" | "REFRACTIVE_GROUND";
  surveyX?: number;
  surveyY?: number;
  bearing?: string;
  distanceBand?: "NEAR" | "MID" | "FAR";
  confidence?: "LOW" | "MEDIUM" | "HIGH";
};

// How each server event-log type should read in the Activity Feed.
const FEED_MAPPING_BY_EVENT_TYPE: Record<string, { type: FeedType; severity: FeedSeverity }> = {
  TOWN_LOST: { type: "combat", severity: "error" },
  IMPERIAL_EXCHANGE_LEVY_HIT: { type: "combat", severity: "warn" },
  IMPERIAL_EXCHANGE_LEVY_CAST: { type: "combat", severity: "info" },
  MONUMENT_CLAIMED: { type: "tech", severity: "success" },
  MONUMENT_LOST_TO_RIVAL: { type: "combat", severity: "warn" },
  MONUMENT_CONSTRUCTION_STARTED: { type: "tech", severity: "info" },
  NATURAL_WONDER_CLAIMED: { type: "tech", severity: "success" },
  WAYSTATION_ACTIVATED: { type: "tech", severity: "success" },
  OCCUPATION_SURVEY: { type: "tech", severity: "success" }
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
  occupationSurveyController.record(entry);
  const { type, severity } = feedMappingForEventType(entry.type);
  return {
    text: entry.text,
    type,
    severity,
    at: entry.occurredAt,
    ...(typeof entry.surveyX === "number" && typeof entry.surveyY === "number"
      ? { focusX: entry.surveyX, focusY: entry.surveyY, actionLabel: "View survey" }
      : typeof entry.x === "number" && typeof entry.y === "number"
        ? { focusX: entry.x, focusY: entry.y, actionLabel: "Go to tile" }
      : {})
  };
};

// On first sync after (re)login, backfill the Activity Feed with recent
// history instead of silently discarding it — see client-network.ts's
// eventLogFeedSeenIds handling for the "don't re-backfill on later syncs" half.
// Kept even though the new Activity dashboard (client-activity-dashboard/)
// now covers combat/territory/gold history better: the dashboard is Phase-1
// scoped and doesn't yet cover town/waystation/monument/survey event types
// (Phase 2, personal-impact-log), so this remains the only catch-up path for
// those until that lands (docs/activity-dashboard-plan.md §3.1: "retain it
// while those consumers migrate, then remove only after explicit replacement
// tests pass").
export const FEED_BACKFILL_WINDOW_MS = 24 * 60 * 60 * 1000;

export const seedFeedFromEventLog = (
  state: FeedMutableState,
  incomingEventLog: ClientEventLogEntry[],
  nowMs: number = Date.now()
): void => {
  const cutoff = nowMs - FEED_BACKFILL_WINDOW_MS;
  const toBackfill = incomingEventLog.filter((entry) => entry.occurredAt >= cutoff).sort((a, b) => a.occurredAt - b.occurredAt);
  for (const entry of toBackfill) pushFeedEntry(state, feedEntryForEventLogEntry(entry));
};
