import type { QueueLane } from "./command-lane.js";

const LANES: QueueLane[] = ["human_interactive", "human_noninteractive", "system", "ai"];

const quantile = (values: number[], q: number): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * q) - 1));
  return sorted[index] ?? 0;
};

const clampMetric = (value: number): number => (Number.isFinite(value) && value >= 0 ? value : 0);
const formatMetricValue = (value: number): string => (Number.isInteger(value) ? `${value}` : value.toFixed(3));

type QuantileSample = {
  p50: number;
  p95: number;
  p99: number;
};

type SimulationMetricsSnapshot = {
  simEventLoopMaxMs: number;
  simHumanInteractiveBacklogMs: number;
  simAiPlannerBreaches: number;
  simCheckpointRssMb: number;
  simCommandAcceptLatencyMsByLane: Record<QueueLane, QuantileSample>;
  simEventStoreWriteMs: QuantileSample;
};

export const createSimulationMetrics = (sampleLimit = 512) => {
  const limit = Math.max(8, sampleLimit);
  const simCommandAcceptLatencyMsByLane = new Map<QueueLane, number[]>(LANES.map((lane) => [lane, []]));
  const simEventStoreWriteMs: number[] = [];
  let simEventLoopMaxMs = 0;
  let simHumanInteractiveBacklogMs = 0;
  let simAiPlannerBreaches = 0;
  let simCheckpointRssMb = 0;

  const appendSample = (target: number[], value: number): void => {
    target.push(clampMetric(value));
    if (target.length > limit) target.splice(0, target.length - limit);
  };

  const quantileSample = (series: number[]): QuantileSample => ({
    p50: quantile(series, 0.5),
    p95: quantile(series, 0.95),
    p99: quantile(series, 0.99)
  });

  const snapshot = (): SimulationMetricsSnapshot => ({
    simEventLoopMaxMs,
    simHumanInteractiveBacklogMs,
    simAiPlannerBreaches,
    simCheckpointRssMb,
    simCommandAcceptLatencyMsByLane: {
      human_interactive: quantileSample(simCommandAcceptLatencyMsByLane.get("human_interactive") ?? []),
      human_noninteractive: quantileSample(simCommandAcceptLatencyMsByLane.get("human_noninteractive") ?? []),
      system: quantileSample(simCommandAcceptLatencyMsByLane.get("system") ?? []),
      ai: quantileSample(simCommandAcceptLatencyMsByLane.get("ai") ?? [])
    },
    simEventStoreWriteMs: quantileSample(simEventStoreWriteMs)
  });

  return {
    setSimEventLoopMaxMs(value: number): void {
      simEventLoopMaxMs = clampMetric(value);
    },
    setSimHumanInteractiveBacklogMs(value: number): void {
      simHumanInteractiveBacklogMs = clampMetric(value);
    },
    incrementSimAiPlannerBreaches(): void {
      simAiPlannerBreaches += 1;
    },
    setSimCheckpointRssMb(value: number): void {
      simCheckpointRssMb = clampMetric(value);
    },
    observeSimCommandAcceptLatencyMs(lane: QueueLane, value: number): void {
      const target = simCommandAcceptLatencyMsByLane.get(lane);
      if (!target) return;
      appendSample(target, value);
    },
    observeSimEventStoreWriteMs(value: number): void {
      appendSample(simEventStoreWriteMs, value);
    },
    currentAcceptLatencyP95Ms(): number {
      const humanInteractive = simCommandAcceptLatencyMsByLane.get("human_interactive") ?? [];
      return quantile(humanInteractive, 0.95);
    },
    snapshot,
    renderPrometheus(): string {
      const sample = snapshot();
      const lines = [
        "# TYPE sim_event_loop_max_ms gauge",
        `sim_event_loop_max_ms ${formatMetricValue(sample.simEventLoopMaxMs)}`,
        "# TYPE sim_human_interactive_backlog_ms gauge",
        `sim_human_interactive_backlog_ms ${formatMetricValue(sample.simHumanInteractiveBacklogMs)}`,
        "# TYPE sim_ai_planner_breaches counter",
        `sim_ai_planner_breaches ${formatMetricValue(sample.simAiPlannerBreaches)}`,
        "# TYPE sim_checkpoint_rss_mb gauge",
        `sim_checkpoint_rss_mb ${formatMetricValue(sample.simCheckpointRssMb)}`,
        "# TYPE sim_event_store_write_ms gauge",
        `sim_event_store_write_ms{quantile=\"p50\"} ${formatMetricValue(sample.simEventStoreWriteMs.p50)}`,
        `sim_event_store_write_ms{quantile=\"p95\"} ${formatMetricValue(sample.simEventStoreWriteMs.p95)}`,
        `sim_event_store_write_ms{quantile=\"p99\"} ${formatMetricValue(sample.simEventStoreWriteMs.p99)}`,
        "# TYPE sim_command_accept_latency_ms gauge"
      ];

      for (const lane of LANES) {
        const laneSample = sample.simCommandAcceptLatencyMsByLane[lane];
        lines.push(`sim_command_accept_latency_ms{lane=\"${lane}\",quantile=\"p50\"} ${formatMetricValue(laneSample.p50)}`);
        lines.push(`sim_command_accept_latency_ms{lane=\"${lane}\",quantile=\"p95\"} ${formatMetricValue(laneSample.p95)}`);
        lines.push(`sim_command_accept_latency_ms{lane=\"${lane}\",quantile=\"p99\"} ${formatMetricValue(laneSample.p99)}`);
      }

      return lines.join("\n");
    }
  };
};

export type SimulationMetrics = ReturnType<typeof createSimulationMetrics>;
