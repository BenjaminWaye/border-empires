// Fixed-size process counters for the stranded-frontier cleanup, appended to
// /metrics by metrics-prometheus.ts. Kept here (not in metrics.ts, which is at
// the 500-line cap) so the cleanup can count every guard without threading a
// callback through SimulationRuntime/simulation-service. Monotonic counters
// only, so surviving a runtime rebuild (season rollover) is harmless.

export type StrandedFrontierCounterName =
  | "originChecks"
  | "originSlowPath"
  | "originReleased"
  | "regionChecks"
  | "regionInvalid"
  | "tilesReleased"
  | "capHits";

const counters: Record<StrandedFrontierCounterName, number> = {
  originChecks: 0,
  originSlowPath: 0,
  originReleased: 0,
  regionChecks: 0,
  regionInvalid: 0,
  tilesReleased: 0,
  capHits: 0
};

export const incrementStrandedFrontierCounter = (name: StrandedFrontierCounterName, amount = 1): void => {
  counters[name] += amount;
};

export const strandedFrontierCounter = (name: StrandedFrontierCounterName): number => counters[name];

const PROMETHEUS_NAMES: Record<StrandedFrontierCounterName, string> = {
  originChecks: "sim_stranded_frontier_origin_checks_total",
  originSlowPath: "sim_stranded_frontier_origin_slow_path_total",
  originReleased: "sim_stranded_frontier_origin_released_total",
  regionChecks: "sim_stranded_frontier_region_checks_total",
  regionInvalid: "sim_stranded_frontier_region_invalid_total",
  tilesReleased: "sim_stranded_frontier_tiles_released_total",
  capHits: "sim_stranded_frontier_cap_hits_total"
};

export const renderStrandedFrontierPrometheusLines = (): string[] =>
  (Object.keys(PROMETHEUS_NAMES) as StrandedFrontierCounterName[]).flatMap((name) => [
    `# TYPE ${PROMETHEUS_NAMES[name]} counter`,
    `${PROMETHEUS_NAMES[name]} ${counters[name]}`
  ]);
