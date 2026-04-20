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
  gatewayWsSessions: number;
  gatewayBackendConnected: number;
  gatewayCommandSubmitLatencyMs: QuantileSample;
  gatewaySimRpcLatencyMs: QuantileSample;
};

export const createGatewayMetrics = (sampleLimit = 512) => {
  const limit = Math.max(8, sampleLimit);
  const commandSubmitLatencyMs: number[] = [];
  const simRpcLatencyMs: number[] = [];
  let gatewayEventLoopMaxMs = 0;
  let gatewayWsSessions = 0;
  let gatewayBackendConnected = 0;

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
    gatewayWsSessions,
    gatewayBackendConnected,
    gatewayCommandSubmitLatencyMs: quantileSample(commandSubmitLatencyMs),
    gatewaySimRpcLatencyMs: quantileSample(simRpcLatencyMs)
  });

  return {
    setGatewayEventLoopMaxMs(value: number): void {
      gatewayEventLoopMaxMs = clampMetric(value);
    },
    setGatewayWsSessions(value: number): void {
      gatewayWsSessions = Math.max(0, Math.floor(clampMetric(value)));
    },
    setGatewayBackendConnected(connected: boolean): void {
      gatewayBackendConnected = connected ? 1 : 0;
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
        "# TYPE gateway_ws_sessions gauge",
        `gateway_ws_sessions ${formatMetricValue(sample.gatewayWsSessions)}`,
        "# TYPE gateway_backend_connected gauge",
        `gateway_backend_connected ${formatMetricValue(sample.gatewayBackendConnected)}`,
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
