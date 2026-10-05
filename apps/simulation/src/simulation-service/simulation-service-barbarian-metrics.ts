import type { SimulationRuntime } from "../runtime/runtime.js";
import type { SimulationMetrics } from "../metrics/metrics.js";
import { sampleActivityLogMetrics } from "./simulation-service-activity-log-metrics.js";
import { samplePersistenceLogMetrics } from "./simulation-service-persistence-log-metrics.js";

type ActivityLogArgs = Parameters<typeof sampleActivityLogMetrics>;

/** Gauge the growable barbarian state (docs/agents/state-and-persistence-discipline.md). */
export const sampleBarbarianMetrics = (
  runtime: Pick<SimulationRuntime, "barbarianStateSizes">,
  metrics: Pick<SimulationMetrics, "setSimBarbarianState">
): void => {
  metrics.setSimBarbarianState(runtime.barbarianStateSizes());
};

/** Everything sampled from the runtime on the periodic metrics tick that isn't already inline. */
export const sampleRuntimeGaugeMetrics = (
  runtime: ActivityLogArgs[0] & Pick<SimulationRuntime, "barbarianStateSizes" | "persistenceLogStats">,
  metrics: ActivityLogArgs[1] & Pick<SimulationMetrics, "setSimBarbarianState" | "setSimPersistenceLogStats">
): void => {
  sampleActivityLogMetrics(runtime, metrics);
  sampleBarbarianMetrics(runtime, metrics);
  samplePersistenceLogMetrics(runtime, metrics);
};
