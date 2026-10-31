export type DebugEvent = {
  at: number;
  level: "info" | "warn" | "error";
  scope: string;
  event: string;
  payload: Record<string, unknown>;
};
const MAX_INCIDENTS = 20;
const PRE_EVENTS = 80;
const POST_EVENTS = 40;
const POST_WINDOW_MS = 15_000;
const incidents: Array<{ at: number; trigger: string; events: DebugEvent[]; postEvents: number }> = [];
let evicted = 0;
let timeoutCount = 0;
let debugEventsEvicted = 0;
let snapshotFailures = 0;
export const copyDebugEvent = (entry: DebugEvent): DebugEvent => {
  try { return structuredClone(entry); }
  catch {
    snapshotFailures += 1;
    return { ...entry, payload: { snapshotFailed: true } };
  }
};

export const recordDebugIncident = (entry: DebugEvent, recent: DebugEvent[], ringEvicted: boolean): void => {
  if (ringEvicted) debugEventsEvicted += 1;
  const active = incidents.filter((incident) => entry.at - incident.at <= POST_WINDOW_MS && incident.postEvents < POST_EVENTS);
  if (active.length > 0) {
    const copy = copyDebugEvent(entry);
    for (const incident of active) {
      incident.events.push(copy);
      incident.postEvents += 1;
    }
  }
  if (entry.scope !== "attack-sync" || !["action-accept-timeout", "combat-start-timeout", "combat-result-timeout"].includes(entry.event)) return;
  timeoutCount += 1;
  incidents.push({ at: entry.at, trigger: entry.event, events: recent.slice(-PRE_EVENTS).map(copyDebugEvent), postEvents: 0 });
  if (incidents.length > MAX_INCIDENTS) { incidents.shift(); evicted += 1; }
};

export const snapshotClientDebugIncidents = () => ({
  timeoutCount, evicted, debugEventsEvicted, snapshotFailures, retainedCount: incidents.length,
  limits: { incidents: MAX_INCIDENTS, preEvents: PRE_EVENTS, postEvents: POST_EVENTS, postWindowMs: POST_WINDOW_MS },
  windows: structuredClone(incidents)
});
