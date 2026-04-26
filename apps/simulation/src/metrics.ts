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

type TickSource = "ai" | "system";
type PrepareMetricSource = "prepare" | "spawn";

type SimulationMetricsSnapshot = {
  simEventLoopMaxMs: number;
  simEventLoopDelayMs: QuantileSample;
  simTickDurationMs: Record<TickSource, QuantileSample>;
  simPreparePlayerLatencyMs: Record<PrepareMetricSource, QuantileSample>;
  simHumanInteractiveBacklogMs: number;
  simAiPlannerBreaches: number;
  simCheckpointRssMb: number;
  simCpuPercent: number;
  simHeapUsedMb: number;
  simHeapTotalMb: number;
  simGcPauseMs: QuantileSample;
  simCommandAcceptLatencyMsByLane: Record<QueueLane, QuantileSample>;
  simEventStoreWriteMs: QuantileSample;
};

export const createSimulationMetrics = (sampleLimit = 512) => {
  const limit = Math.max(8, sampleLimit);
  const simEventLoopDelayMs: number[] = [];
  const simTickDurationMs = new Map<TickSource, number[]>([
    ["ai", []],
    ["system", []]
  ]);
  const simPreparePlayerLatencyMs = new Map<PrepareMetricSource, number[]>([
    ["prepare", []],
    ["spawn", []]
  ]);
  const simCommandAcceptLatencyMsByLane = new Map<QueueLane, number[]>(LANES.map((lane) => [lane, []]));
  const simEventStoreWriteMs: number[] = [];
  const simGcPauseMs: number[] = [];
  let simEventLoopMaxMs = 0;
  let simHumanInteractiveBacklogMs = 0;
  let simAiPlannerBreaches = 0;
  let simCheckpointRssMb = 0;
  let simCpuPercent = 0;
  let simHeapUsedMb = 0;
  let simHeapTotalMb = 0;

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
    simEventLoopDelayMs: quantileSample(simEventLoopDelayMs),
    simTickDurationMs: {
      ai: quantileSample(simTickDurationMs.get("ai") ?? []),
      system: quantileSample(simTickDurationMs.get("system") ?? [])
    },
    simPreparePlayerLatencyMs: {
      prepare: quantileSample(simPreparePlayerLatencyMs.get("prepare") ?? []),
      spawn: quantileSample(simPreparePlayerLatencyMs.get("spawn") ?? [])
    },
    simHumanInteractiveBacklogMs,
    simAiPlannerBreaches,
    simCheckpointRssMb,
    simCpuPercent,
    simHeapUsedMb,
    simHeapTotalMb,
    simGcPauseMs: quantileSample(simGcPauseMs),
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
    observeSimEventLoopDelayMs(value: number): void {
      appendSample(simEventLoopDelayMs, value);
    },
    observeSimTickDurationMs(source: TickSource, value: number): void {
      const target = simTickDurationMs.get(source);
      if (!target) return;
      appendSample(target, value);
    },
    observeSimPreparePlayerLatencyMs(source: PrepareMetricSource, value: number): void {
      const target = simPreparePlayerLatencyMs.get(source);
      if (!target) return;
      appendSample(target, value);
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
    setSimCpuPercent(value: number): void {
      simCpuPercent = clampMetric(value);
    },
    setSimHeapUsageMb(values: { heapUsedMb: number; heapTotalMb: number }): void {
      simHeapUsedMb = clampMetric(values.heapUsedMb);
      simHeapTotalMb = clampMetric(values.heapTotalMb);
    },
    observeSimGcPauseMs(value: number): void {
      appendSample(simGcPauseMs, value);
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
        "# TYPE sim_event_loop_delay_ms gauge",
        `sim_event_loop_delay_ms{quantile=\"p50\"} ${formatMetricValue(sample.simEventLoopDelayMs.p50)}`,
        `sim_event_loop_delay_ms{quantile=\"p95\"} ${formatMetricValue(sample.simEventLoopDelayMs.p95)}`,
        `sim_event_loop_delay_ms{quantile=\"p99\"} ${formatMetricValue(sample.simEventLoopDelayMs.p99)}`,
        "# TYPE sim_tick_duration_ms gauge",
        `sim_tick_duration_ms{source=\"ai\",quantile=\"p50\"} ${formatMetricValue(sample.simTickDurationMs.ai.p50)}`,
        `sim_tick_duration_ms{source=\"ai\",quantile=\"p95\"} ${formatMetricValue(sample.simTickDurationMs.ai.p95)}`,
        `sim_tick_duration_ms{source=\"ai\",quantile=\"p99\"} ${formatMetricValue(sample.simTickDurationMs.ai.p99)}`,
        `sim_tick_duration_ms{source=\"system\",quantile=\"p50\"} ${formatMetricValue(sample.simTickDurationMs.system.p50)}`,
        `sim_tick_duration_ms{source=\"system\",quantile=\"p95\"} ${formatMetricValue(sample.simTickDurationMs.system.p95)}`,
        `sim_tick_duration_ms{source=\"system\",quantile=\"p99\"} ${formatMetricValue(sample.simTickDurationMs.system.p99)}`,
        "# TYPE sim_prepare_player_latency_ms gauge",
        `sim_prepare_player_latency_ms{source=\"prepare\",quantile=\"p50\"} ${formatMetricValue(sample.simPreparePlayerLatencyMs.prepare.p50)}`,
        `sim_prepare_player_latency_ms{source=\"prepare\",quantile=\"p95\"} ${formatMetricValue(sample.simPreparePlayerLatencyMs.prepare.p95)}`,
        `sim_prepare_player_latency_ms{source=\"prepare\",quantile=\"p99\"} ${formatMetricValue(sample.simPreparePlayerLatencyMs.prepare.p99)}`,
        `sim_prepare_player_latency_ms{source=\"spawn\",quantile=\"p50\"} ${formatMetricValue(sample.simPreparePlayerLatencyMs.spawn.p50)}`,
        `sim_prepare_player_latency_ms{source=\"spawn\",quantile=\"p95\"} ${formatMetricValue(sample.simPreparePlayerLatencyMs.spawn.p95)}`,
        `sim_prepare_player_latency_ms{source=\"spawn\",quantile=\"p99\"} ${formatMetricValue(sample.simPreparePlayerLatencyMs.spawn.p99)}`,
        "# TYPE sim_human_interactive_backlog_ms gauge",
        `sim_human_interactive_backlog_ms ${formatMetricValue(sample.simHumanInteractiveBacklogMs)}`,
        "# TYPE sim_ai_planner_breaches counter",
        `sim_ai_planner_breaches ${formatMetricValue(sample.simAiPlannerBreaches)}`,
        "# TYPE sim_checkpoint_rss_mb gauge",
        `sim_checkpoint_rss_mb ${formatMetricValue(sample.simCheckpointRssMb)}`,
        "# TYPE sim_cpu_percent gauge",
        `sim_cpu_percent ${formatMetricValue(sample.simCpuPercent)}`,
        "# TYPE sim_heap_used_mb gauge",
        `sim_heap_used_mb ${formatMetricValue(sample.simHeapUsedMb)}`,
        "# TYPE sim_heap_total_mb gauge",
        `sim_heap_total_mb ${formatMetricValue(sample.simHeapTotalMb)}`,
        "# TYPE sim_gc_pause_ms gauge",
        `sim_gc_pause_ms{quantile=\"p50\"} ${formatMetricValue(sample.simGcPauseMs.p50)}`,
        `sim_gc_pause_ms{quantile=\"p95\"} ${formatMetricValue(sample.simGcPauseMs.p95)}`,
        `sim_gc_pause_ms{quantile=\"p99\"} ${formatMetricValue(sample.simGcPauseMs.p99)}`,
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
