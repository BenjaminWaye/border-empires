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

export type GatewayMetricsSnapshot = {
  gatewayEventLoopMaxMs: number;
  gatewayEventLoopDelayMs: QuantileSample;
  gatewayWsSessions: number;
  gatewayBackendConnected: number;
  gatewayCpuPercent: number;
  gatewayRssMb: number;
  gatewayHeapUsedMb: number;
  gatewayHeapTotalMb: number;
  gatewayGcPauseMs: QuantileSample;
  gatewayInputToStateUpdateLatencyMs: QuantileSample;
  gatewayCommandSubmitLatencyMs: QuantileSample;
  gatewaySimRpcLatencyMs: QuantileSample;
};

export const createGatewayMetrics = (sampleLimit = 512) => {
  const limit = Math.max(8, sampleLimit);
  const eventLoopDelayMs: number[] = [];
  const gcPauseMs: number[] = [];
  const inputToStateUpdateLatencyMs: number[] = [];
  const commandSubmitLatencyMs: number[] = [];
  const simRpcLatencyMs: number[] = [];
  let gatewayEventLoopMaxMs = 0;
  let gatewayWsSessions = 0;
  let gatewayBackendConnected = 0;
  let gatewayCpuPercent = 0;
  let gatewayRssMb = 0;
  let gatewayHeapUsedMb = 0;
  let gatewayHeapTotalMb = 0;

  const appendSample = (target: number[], value: number): void => {
    target.push(clampMetric(value));
    if (target.length > limit) target.splice(0, target.length - limit);
  };

  const quantileSample = (series: number[]): QuantileSample => ({
    p50: quantile(series, 0.5),
    p95: quantile(series, 0.95),
    p99: quantile(series, 0.99)
  });

  const snapshot = (): GatewayMetricsSnapshot => ({
    gatewayEventLoopMaxMs,
    gatewayEventLoopDelayMs: quantileSample(eventLoopDelayMs),
    gatewayWsSessions,
    gatewayBackendConnected,
    gatewayCpuPercent,
    gatewayRssMb,
    gatewayHeapUsedMb,
    gatewayHeapTotalMb,
    gatewayGcPauseMs: quantileSample(gcPauseMs),
    gatewayInputToStateUpdateLatencyMs: quantileSample(inputToStateUpdateLatencyMs),
    gatewayCommandSubmitLatencyMs: quantileSample(commandSubmitLatencyMs),
    gatewaySimRpcLatencyMs: quantileSample(simRpcLatencyMs)
  });

  return {
    setGatewayEventLoopMaxMs(value: number): void {
      gatewayEventLoopMaxMs = clampMetric(value);
    },
    observeGatewayEventLoopDelayMs(value: number): void {
      appendSample(eventLoopDelayMs, value);
    },
    setGatewayWsSessions(value: number): void {
      gatewayWsSessions = Math.max(0, Math.floor(clampMetric(value)));
    },
    setGatewayBackendConnected(connected: boolean): void {
      gatewayBackendConnected = connected ? 1 : 0;
    },
    setGatewayCpuPercent(value: number): void {
      gatewayCpuPercent = clampMetric(value);
    },
    setGatewayMemoryUsageMb(values: {
      rssMb: number;
      heapUsedMb: number;
      heapTotalMb: number;
    }): void {
      gatewayRssMb = clampMetric(values.rssMb);
      gatewayHeapUsedMb = clampMetric(values.heapUsedMb);
      gatewayHeapTotalMb = clampMetric(values.heapTotalMb);
    },
    observeGatewayGcPauseMs(value: number): void {
      appendSample(gcPauseMs, value);
    },
    observeGatewayInputToStateUpdateLatencyMs(value: number): void {
      appendSample(inputToStateUpdateLatencyMs, value);
    },
    observeGatewayCommandSubmitLatencyMs(value: number): void {
      appendSample(commandSubmitLatencyMs, value);
    },
    observeGatewaySimRpcLatencyMs(value: number): void {
      appendSample(simRpcLatencyMs, value);
    },
    snapshot,
    renderPrometheus(): string {
      const sample = snapshot();
      return [
        "# TYPE gateway_event_loop_max_ms gauge",
        `gateway_event_loop_max_ms ${formatMetricValue(sample.gatewayEventLoopMaxMs)}`,
        "# TYPE gateway_event_loop_delay_ms gauge",
        `gateway_event_loop_delay_ms{quantile=\"p50\"} ${formatMetricValue(sample.gatewayEventLoopDelayMs.p50)}`,
        `gateway_event_loop_delay_ms{quantile=\"p95\"} ${formatMetricValue(sample.gatewayEventLoopDelayMs.p95)}`,
        `gateway_event_loop_delay_ms{quantile=\"p99\"} ${formatMetricValue(sample.gatewayEventLoopDelayMs.p99)}`,
        "# TYPE gateway_ws_sessions gauge",
        `gateway_ws_sessions ${formatMetricValue(sample.gatewayWsSessions)}`,
        "# TYPE gateway_backend_connected gauge",
        `gateway_backend_connected ${formatMetricValue(sample.gatewayBackendConnected)}`,
        "# TYPE gateway_cpu_percent gauge",
        `gateway_cpu_percent ${formatMetricValue(sample.gatewayCpuPercent)}`,
        "# TYPE gateway_rss_mb gauge",
        `gateway_rss_mb ${formatMetricValue(sample.gatewayRssMb)}`,
        "# TYPE gateway_heap_used_mb gauge",
        `gateway_heap_used_mb ${formatMetricValue(sample.gatewayHeapUsedMb)}`,
        "# TYPE gateway_heap_total_mb gauge",
        `gateway_heap_total_mb ${formatMetricValue(sample.gatewayHeapTotalMb)}`,
        "# TYPE gateway_gc_pause_ms gauge",
        `gateway_gc_pause_ms{quantile=\"p50\"} ${formatMetricValue(sample.gatewayGcPauseMs.p50)}`,
        `gateway_gc_pause_ms{quantile=\"p95\"} ${formatMetricValue(sample.gatewayGcPauseMs.p95)}`,
        `gateway_gc_pause_ms{quantile=\"p99\"} ${formatMetricValue(sample.gatewayGcPauseMs.p99)}`,
        "# TYPE gateway_input_to_state_update_latency_ms gauge",
        `gateway_input_to_state_update_latency_ms{quantile=\"p50\"} ${formatMetricValue(sample.gatewayInputToStateUpdateLatencyMs.p50)}`,
        `gateway_input_to_state_update_latency_ms{quantile=\"p95\"} ${formatMetricValue(sample.gatewayInputToStateUpdateLatencyMs.p95)}`,
        `gateway_input_to_state_update_latency_ms{quantile=\"p99\"} ${formatMetricValue(sample.gatewayInputToStateUpdateLatencyMs.p99)}`,
        "# TYPE gateway_command_submit_latency_ms gauge",
        `gateway_command_submit_latency_ms{quantile=\"p50\"} ${formatMetricValue(sample.gatewayCommandSubmitLatencyMs.p50)}`,
        `gateway_command_submit_latency_ms{quantile=\"p95\"} ${formatMetricValue(sample.gatewayCommandSubmitLatencyMs.p95)}`,
        `gateway_command_submit_latency_ms{quantile=\"p99\"} ${formatMetricValue(sample.gatewayCommandSubmitLatencyMs.p99)}`,
        "# TYPE gateway_sim_rpc_latency_ms gauge",
        `gateway_sim_rpc_latency_ms{quantile=\"p50\"} ${formatMetricValue(sample.gatewaySimRpcLatencyMs.p50)}`,
        `gateway_sim_rpc_latency_ms{quantile=\"p95\"} ${formatMetricValue(sample.gatewaySimRpcLatencyMs.p95)}`,
        `gateway_sim_rpc_latency_ms{quantile=\"p99\"} ${formatMetricValue(sample.gatewaySimRpcLatencyMs.p99)}`
      ].join("\n");
    }
  };
};
