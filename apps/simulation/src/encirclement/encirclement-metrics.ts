// Fixed-size process counters for encirclement, appended to /metrics by
// metrics-prometheus.ts (same pattern as stranded-frontier-metrics.ts).
// The cap bail-out used to be a log line only, which is how a cap that
// silently skipped encirclement for every mid-game empire went unnoticed.
// Monotonic counters only, so surviving a runtime rebuild is harmless.

export type EncirclementCounterName = "checks" | "capHits" | "tilesCutOff";

const counters: Record<EncirclementCounterName, number> = {
  checks: 0,
  capHits: 0,
  tilesCutOff: 0
};

export const incrementEncirclementCounter = (name: EncirclementCounterName, amount = 1): void => {
  counters[name] += amount;
};

export const encirclementCounter = (name: EncirclementCounterName): number => counters[name];

const PROMETHEUS_NAMES: Record<EncirclementCounterName, string> = {
  checks: "sim_encirclement_checks_total",
  capHits: "sim_encirclement_cap_hits_total",
  tilesCutOff: "sim_encirclement_tiles_cut_off_total"
};

export const renderEncirclementPrometheusLines = (): string[] =>
  (Object.keys(PROMETHEUS_NAMES) as EncirclementCounterName[]).flatMap((name) => [
    `# TYPE ${PROMETHEUS_NAMES[name]} counter`,
    `${PROMETHEUS_NAMES[name]} ${counters[name]}`
  ]);
