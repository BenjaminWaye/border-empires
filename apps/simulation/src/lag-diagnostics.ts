/**
 * Death-forensics ring buffer — rolling window of recent lag diagnostics
 * forwarded to the gateway main thread so both watchdog-kill and sim-exit
 * write paths have the sim's last known state.
 */
export type LagDiagEntry = {
  at: number;
  level: "warn" | "error";
  event: string;
  phase?: unknown;
  durationMs?: unknown;
  gcKind?: unknown;
  // event_loop_blocked-only: what the main-thread task tracker and GC
  // observer saw during the stalled window. buildEventLoopBlockedPayload
  // already computes both (sorted/capped) — without carrying them into the
  // ring, the live /admin/runtime/debug-bundle and the client's downloaded
  // debug report can show THAT the thread blocked and THAT a slow SQLite
  // write happened nearby, but never whether the write was the cause or the
  // block was GC. The full payload only reaches stdout (emitLog), which
  // scrolls out of the flyctl buffer in minutes — see
  // event-loop-block-diagnostic.ts.
  mainThreadTasks?: unknown;
  gcPausesDuringBlock?: unknown;
};

const LAG_DIAG_RING_CAP = 50;

export type LagDiagnostics = {
  recordLagDiagnostic: (level: "info" | "warn" | "error", event: string, payload: Record<string, unknown>) => void;
  getLagDiagRing: () => LagDiagEntry[];
};

export const createLagDiagnostics = (options: {
  emitLog: (level: "info" | "warn" | "error", message: string, payload: Record<string, unknown>) => void;
}): LagDiagnostics => {
  const lagDiagRing: LagDiagEntry[] = [];
  const appendLagDiagRing = (level: "warn" | "error", event: string, payload: Record<string, unknown>): void => {
    lagDiagRing.push({
      at: Date.now(),
      level,
      event,
      ...(payload.phase !== undefined ? { phase: payload.phase } : {}),
      ...(typeof payload.durationMs === "number" ? { durationMs: payload.durationMs } : {}),
      ...(typeof payload.gcKind === "string" ? { gcKind: payload.gcKind } : {}),
      ...(Array.isArray(payload.mainThreadTasks) ? { mainThreadTasks: payload.mainThreadTasks } : {}),
      ...(Array.isArray(payload.gcPausesDuringBlock) ? { gcPausesDuringBlock: payload.gcPausesDuringBlock } : {})
    });
    if (lagDiagRing.length > LAG_DIAG_RING_CAP) lagDiagRing.shift();
  };
  return {
    recordLagDiagnostic(level, event, payload) {
      if (level === "info") return;
      options.emitLog(level, `simulation lag diagnostic: ${event}`, payload);
      appendLagDiagRing(level, event, payload);
    },
    getLagDiagRing: () => lagDiagRing.slice()
  };
};
