import { PerformanceObserver } from "node:perf_hooks";
import { decodeGcKind } from "../gc-kind-label/gc-kind-label.js";
import type { LagDiagnostics } from "../lag-diagnostics.js";

/** GC pauses longer than this are recorded for death forensics. */
export const GC_PAUSE_DIAGNOSTIC_MS = 100;

/**
 * Records long GC pauses as "gc_pause_detected" lag diagnostics ("warn", so
 * recordLagDiagnostic keeps them in its death-forensics ring). Returns a
 * disposer the owner must call on shutdown: a connected observer stays
 * registered with node:perf_hooks for the life of the process, and its
 * callback keeps the owner's whole closure scope -- for the simulation
 * service, the runtime and its world -- from ever being collected.
 */
export const startGcPauseObserver = (recordLagDiagnostic: LagDiagnostics["recordLagDiagnostic"]): { disconnect: () => void } => {
  let observer: PerformanceObserver | undefined;
  try {
    observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === "gc" && "duration" in entry && entry.duration > GC_PAUSE_DIAGNOSTIC_MS) {
          recordLagDiagnostic("warn", "gc_pause_detected", {
            durationMs: entry.duration,
            gcKind: decodeGcKind((entry as unknown as Record<string, unknown>).kind as number | undefined)
          });
        }
      }
    });
    observer.observe({ entryTypes: ["gc"], buffered: false });
  } catch {
    // PerformanceObserver for 'gc' can be unavailable; skip the diagnostic.
    observer = undefined;
  }
  return { disconnect: () => observer?.disconnect() };
};
