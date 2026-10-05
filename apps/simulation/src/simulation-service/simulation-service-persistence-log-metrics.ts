import type { SimulationRuntime } from "../runtime/runtime.js";
import type { SimulationMetrics } from "../metrics/metrics.js";

/** Gauge the retained in-memory persistence log (docs/agents/state-and-persistence-discipline.md). */
export const samplePersistenceLogMetrics = (
  runtime: Pick<SimulationRuntime, "persistenceLogStats">,
  metrics: Pick<SimulationMetrics, "setSimPersistenceLogStats">
): void => {
  const stats = runtime.persistenceLogStats();
  if (stats) metrics.setSimPersistenceLogStats(stats);
};
