import type { BugReportInput } from "../slack-alerts/slack-alerts.js";

type ClientEvent = BugReportInput["clientEvents"][number];

// Largest |ms| a Date can represent; beyond it toISOString() throws.
const MAX_DATE_MS = 8.64e15;
const MAX_CLIENT_EVENTS = 100;
const MAX_STRING_FIELD = 200;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// The bug-report endpoint is unauthenticated, so the client-supplied events
// are untrusted. Keep only well-formed entries (finite in-range timestamp,
// string level/event, object payload) so nothing downstream — email
// formatting, Date conversion — can throw on attacker-shaped input.
export const normalizeBugReportClientEvents = (raw: unknown): ClientEvent[] => {
  if (!Array.isArray(raw)) return [];
  const events: ClientEvent[] = [];
  for (const entry of raw.slice(-MAX_CLIENT_EVENTS)) {
    if (!isPlainObject(entry)) continue;
    const { at, level, event, scope, payload } = entry;
    if (typeof at !== "number" || !Number.isFinite(at) || Math.abs(at) > MAX_DATE_MS) continue;
    if (typeof level !== "string" || typeof event !== "string" || !isPlainObject(payload)) continue;
    events.push({
      at,
      level: level.slice(0, MAX_STRING_FIELD),
      scope: typeof scope === "string" ? scope.slice(0, MAX_STRING_FIELD) : "",
      event: event.slice(0, MAX_STRING_FIELD),
      payload
    });
  }
  return events;
};

// Read a string field from client context for logging; anything else
// (objects, numbers, huge strings) is dropped or truncated.
export const boundedContextString = (context: Record<string, unknown>, key: string): string | undefined => {
  const value = context[key];
  return typeof value === "string" ? value.slice(0, MAX_STRING_FIELD) : undefined;
};
