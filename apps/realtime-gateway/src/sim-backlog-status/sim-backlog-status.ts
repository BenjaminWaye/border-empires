// Detects "sim is up but drained by a large persistence backlog" so the
// gateway can tell that apart from a generic startup/unavailable state and
// surface a more honest message than "still starting" — see the 2026-07-14
// staging incident where build_init stalled 80-100s+ while the sim thread
// drained thousands of backlogged commands after a restart. sim_writer_queue_depth
// (apps/simulation/src/metrics/metrics.ts) already tracks exactly this: the
// count of writes queued to the dedicated SQLite writer worker.

const SIM_WRITER_QUEUE_DEPTH_METRIC_RE = /^sim_writer_queue_depth\s+(-?\d+(?:\.\d+)?)/m;

export const parseSimWriterQueueDepth = (metricsText: string): number | undefined => {
  const match = SIM_WRITER_QUEUE_DEPTH_METRIC_RE.exec(metricsText);
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
};

// Default mirrors SqliteWriterChannel's own DEFAULT_MAX_PENDING (500): that's
// the point at which the writer itself starts throttling callers because it's
// falling behind, so it's a principled "this is a real backlog" threshold
// rather than an arbitrary number.
export const DEFAULT_BACKLOG_DEGRADED_THRESHOLD = 500;

export const isBacklogDegraded = (
  pendingCount: number | undefined,
  threshold: number = DEFAULT_BACKLOG_DEGRADED_THRESHOLD
): boolean => typeof pendingCount === "number" && pendingCount >= threshold;

export type SimBacklogHealth = {
  backlogPendingCount?: number | undefined;
  backlogDegraded?: boolean | undefined;
};

// Replaces 5 identical inline literals across gateway-app.ts (one per
// login/command rejection site) — consolidated here both to remove the
// duplication and because gateway-app.ts is already over the file-line cap
// and must not grow.
export const buildServerStartingErrorPayload = (
  backlog: SimBacklogHealth
): { type: "ERROR"; code: "SERVER_STARTING"; message: string; backlogDegraded?: boolean } => ({
  type: "ERROR",
  code: "SERVER_STARTING",
  message: backlog.backlogDegraded
    ? "The game server is replaying a backlog of prior activity after a restart. This can take a few minutes; no progress is lost. Retrying automatically..."
    : "Realtime simulation is temporarily unavailable. Retry shortly.",
  ...(backlog.backlogDegraded ? { backlogDegraded: true } : {})
});

// Polls the sim's own /metrics (already proxied for the runtime dashboard via
// getSimMetrics) on an interval and caches the parsed queue depth — /healthz
// must stay O(1) and never itself perform network I/O, so this can't be a
// per-request fetch. Tolerates fetch/parse failures by keeping the last known
// value; a transient scrape failure should not flip backlog status.
export const createSimBacklogStatusPoller = (options: {
  getSimMetrics: () => Promise<string>;
  target: SimBacklogHealth;
  threshold?: number;
  intervalMs?: number;
  onError?: (error: unknown) => void;
}): { start: () => void; stop: () => void } => {
  const intervalMs = Math.max(1000, options.intervalMs ?? 5000);
  let timer: ReturnType<typeof setInterval> | undefined;
  const poll = async (): Promise<void> => {
    try {
      const metricsText = await options.getSimMetrics();
      const pendingCount = parseSimWriterQueueDepth(metricsText);
      // A successful scrape whose text doesn't (yet) contain the gauge — e.g.
      // the sim hasn't registered it this early in its own boot — is treated
      // the same as a fetch error: keep the last known value rather than
      // silently clearing a real backlog signal to undefined/false.
      if (pendingCount === undefined) return;
      options.target.backlogPendingCount = pendingCount;
      options.target.backlogDegraded = isBacklogDegraded(pendingCount, options.threshold);
    } catch (error) {
      options.onError?.(error);
    }
  };
  return {
    start: () => {
      if (timer) return;
      void poll();
      timer = setInterval(() => void poll(), intervalMs);
      timer.unref?.();
    },
    stop: () => {
      if (!timer) return;
      clearInterval(timer);
      timer = undefined;
    }
  };
};
