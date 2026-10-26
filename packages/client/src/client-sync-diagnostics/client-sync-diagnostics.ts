import { recordClientDebugEvent } from "../client-debug/client-debug.js";

const MAX_SAMPLES = 120;
type Sample = { at: number; startTime: number; durationMs: number; visibility: string };
const longTasks: Sample[] = [];
let longTasksEvicted = 0;
let observer: PerformanceObserver | undefined;
let initialized = false;
let longTaskSupported = false;
const counts = { sent: 0, sendSkipped: 0, received: 0 };

const visibility = (): string => typeof document === "undefined" ? "unknown" : document.visibilityState;

export const initSyncDiagnostics = (): void => {
  if (initialized) return;
  initialized = true;
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      recordClientDebugEvent("info", "sync-environment", "visibility-change", { visibility: visibility() });
    });
  }
  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    for (const event of ["online", "offline"] as const) {
      window.addEventListener(event, () => recordClientDebugEvent("info", "sync-environment", "network-status", { online: event === "online" }));
    }
  }
  try {
    longTaskSupported = typeof PerformanceObserver !== "undefined" && PerformanceObserver.supportedEntryTypes.includes("longtask");
    if (!longTaskSupported) return;
    observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const sample = { at: performance.timeOrigin + entry.startTime, startTime: entry.startTime, durationMs: entry.duration, visibility: visibility() };
        longTasks.push(sample);
        if (sample.durationMs >= 100) recordClientDebugEvent("warn", "sync-environment", "long-task", sample);
        if (longTasks.length > MAX_SAMPLES) { longTasks.shift(); longTasksEvicted += 1; }
      }
    });
    observer.observe({ type: "longtask", buffered: true });
  } catch {
    longTaskSupported = false;
  }
};

// Whitelist wire fields: AUTH payloads, full combat results and arbitrary
// user messages must never enter diagnostics through this transport hook.
const diagnosticMessage = (data: string): Record<string, unknown> | undefined => {
  if (data.length > 64_000 || !/"type"\s*:\s*"(?:ATTACK|EXPAND|COMMAND_QUEUED|ACTION_ACCEPTED|COMBAT_START|COMBAT_RESULT|ERROR)"/.test(data.slice(0, 256))) return undefined;
  try {
    const message: unknown = JSON.parse(data);
    if (typeof message !== "object" || message === null) return undefined;
    const fields = Object.entries(message);
    const type = fields.find(([key]) => key === "type")?.[1];
    if (!["ATTACK", "EXPAND", "COMMAND_QUEUED", "ACTION_ACCEPTED", "COMBAT_START", "COMBAT_RESULT", "ERROR"].includes(String(type))) return undefined;
    return Object.fromEntries(fields.filter(([key, value]) =>
      ["type", "commandId", "clientSeq", "fromX", "fromY", "toX", "toY", "resolvesAt", "code"].includes(key) &&
      (typeof value === "string" || typeof value === "number")));
  } catch { return undefined; }
};

export const recordSyncWireEvent = (
  event: "wire-sent" | "wire-send-skipped" | "wire-received" | "wire-applied",
  data: string,
  context: { channel?: string; generation?: number; bufferedAmount?: number; handlerMs?: number } = {}
): void => {
  const message = diagnosticMessage(data);
  if (!message) return;
  if (event === "wire-sent") counts.sent += 1;
  if (event === "wire-send-skipped") counts.sendSkipped += 1;
  if (event === "wire-received") counts.received += 1;
  recordClientDebugEvent("info", "sync-wire", event, {
    ...message, ...context, monotonicAtMs: performance.now(), visibility: visibility(),
    online: typeof navigator === "undefined" ? undefined : navigator.onLine
  });
};

export const snapshotSyncDiagnostics = () => ({
  at: Date.now(), monotonicAtMs: performance.now(), timeOrigin: performance.timeOrigin,
  visibility: visibility(), online: typeof navigator === "undefined" ? undefined : navigator.onLine,
  counts: { ...counts }, longTaskSupported, longTasks: longTasks.map((sample) => ({ ...sample })),
  longTasksEvicted, longTaskSampleCount: longTasks.length,
  timingNote: "Client elapsed times use its monotonic clock. Server wall times are separate; do not subtract them without clock-offset evidence."
});
