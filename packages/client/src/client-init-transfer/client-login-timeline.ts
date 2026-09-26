import { recordClientDebugEvent } from "../client-debug/client-debug.js";

// Measured timeline of the end of login: chunked INIT download, INIT parse,
// the synchronous INIT handler, and every main-thread long task (>50ms) until
// the map settles. Recorded as one "login-timeline" debug event, so it lands
// in the Download diagnostics bundle. This exists so the post-download freeze
// can be attributed from real device data instead of inferred.

const SUMMARY_DELAY_AFTER_DISPATCH_MS = 20_000;
const MAX_LONG_TASKS = 40;
/** Parses at or above this size are timed (INIT and big chunk batches). */
export const TIMED_PARSE_MIN_CHARS = 64 * 1024;

type LongTaskSample = { atMs: number; durationMs: number };
type ParseSample = { atMs: number; chars: number; durationMs: number; type: string };

type LoginTimeline = {
  origin: number;
  marks: Record<string, number>;
  facts: Record<string, number | string | boolean>;
  parses: ParseSample[];
  longTasks: LongTaskSample[];
  observer: PerformanceObserver | null;
  summaryTimer: ReturnType<typeof setTimeout> | null;
};

let active: LoginTimeline | null = null;
let lastSummary: Record<string, unknown> | null = null;

/** Most recent finished timeline, for the diagnostics bundle (survives debug-event eviction). */
export const lastLoginTimelineSummary = (): Record<string, unknown> | null => lastSummary;

/** In-progress timeline so far, for a diagnostics download taken mid-login. */
export const snapshotActiveLoginTimeline = (): Record<string, unknown> | null =>
  active ? { marks: { ...active.marks }, facts: { ...active.facts }, parses: [...active.parses], longTasks: [...active.longTasks] } : null;

const now = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());
const round = (value: number): number => Math.round(value * 10) / 10;

const startLongTaskObserver = (timeline: LoginTimeline): PerformanceObserver | null => {
  if (typeof PerformanceObserver === "undefined") return null;
  if (!PerformanceObserver.supportedEntryTypes?.includes("longtask")) return null;
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (timeline.longTasks.length >= MAX_LONG_TASKS) break;
        timeline.longTasks.push({ atMs: round(entry.startTime - timeline.origin), durationMs: round(entry.duration) });
      }
    });
    observer.observe({ type: "longtask", buffered: false });
    return observer;
  } catch {
    return null;
  }
};

/** Starts a fresh timeline (on the first INIT chunk). Any unfinished one is dropped. */
export const beginLoginTimeline = (facts: Record<string, number | string | boolean>): void => {
  if (active) finishLoginTimeline("superseded");
  const timeline: LoginTimeline = {
    origin: now(),
    marks: {},
    facts: { ...facts },
    parses: [],
    longTasks: [],
    observer: null,
    summaryTimer: null
  };
  timeline.observer = startLongTaskObserver(timeline);
  timeline.facts.longTasksObserved = timeline.observer !== null;
  active = timeline;
};

export const markLoginTimeline = (name: string, facts: Record<string, number | string | boolean> = {}): void => {
  if (!active) return;
  active.marks[name] = round(now() - active.origin);
  Object.assign(active.facts, facts);
  if (name === "initDispatchEnd" && !active.summaryTimer) {
    active.summaryTimer = setTimeout(() => finishLoginTimeline("complete"), SUMMARY_DELAY_AFTER_DISPATCH_MS);
  }
};

/** Parses a socket message, timing large ones into the active timeline. */
export const parseIncomingMessage = (data: string): Record<string, unknown> => {
  if (!active || data.length < TIMED_PARSE_MIN_CHARS) return JSON.parse(data) as Record<string, unknown>;
  const startedAt = now();
  const parsed = JSON.parse(data) as Record<string, unknown>;
  if (active.parses.length < MAX_LONG_TASKS) {
    active.parses.push({
      atMs: round(startedAt - active.origin),
      chars: data.length,
      durationMs: round(now() - startedAt),
      type: typeof parsed.type === "string" ? parsed.type : "UNKNOWN"
    });
  }
  return parsed;
};

export const finishLoginTimeline = (outcome: string): void => {
  const timeline = active;
  if (!timeline) return;
  active = null;
  timeline.observer?.disconnect();
  if (timeline.summaryTimer) clearTimeout(timeline.summaryTimer);
  const longTaskTotalMs = timeline.longTasks.reduce((sum, task) => sum + task.durationMs, 0);
  const payload = {
    outcome,
    marks: timeline.marks,
    facts: timeline.facts,
    parses: timeline.parses,
    longTasks: timeline.longTasks,
    longTaskTotalMs: round(longTaskTotalMs),
    device: {
      hardwareConcurrency: typeof navigator !== "undefined" ? navigator.hardwareConcurrency ?? 0 : 0,
      deviceMemory: typeof navigator !== "undefined" ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 0 : 0
    }
  };
  lastSummary = payload;
  recordClientDebugEvent("info", "login-timeline", "summary", payload);
  console.info("[login-timeline]", payload);
};
