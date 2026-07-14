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
      ...(typeof payload.gcKind === "string" ? { gcKind: payload.gcKind } : {})
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
