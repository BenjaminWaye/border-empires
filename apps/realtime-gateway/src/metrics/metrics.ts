const quantile = (values: number[], q: number): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * q) - 1));
  return sorted[index] ?? 0;
};

const clampMetric = (value: number): number => (Number.isFinite(value) && value >= 0 ? value : 0);
const formatMetricValue = (value: number): string => (Number.isInteger(value) ? `${value}` : value.toFixed(3));

const appendSample = (target: number[], value: number, limit: number): void => {
  target.push(clampMetric(value));
  if (target.length > limit) target.splice(0, target.length - limit);
};

const appendRecent = <T>(target: T[], value: T, limit: number): void => {
  target.push(value);
  if (target.length > limit) target.splice(0, target.length - limit);
};

type QuantileSample = {
  p50: number;
  p95: number;
  p99: number;
};

export type GatewaySnapshotMetricSample = {
  trigger: string;
  playerId: string;
  fullVisibility: number;
  tileCount: number;
  snapshotJsonBytes: number;
  tilesJsonBytes: number;
  worldStatusJsonBytes: number;
  cacheEntries: number;
  cacheBytes: number;
  socketCount: number;
  rssMb: number;
  heapUsedMb: number;
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
  gatewaySnapshotTileCount: QuantileSample;
  gatewaySnapshotJsonBytes: QuantileSample;
  gatewaySnapshotTilesJsonBytes: QuantileSample;
  gatewaySnapshotCacheEntries: number;
  gatewaySnapshotCacheBytes: number;
  gatewaySnapshotRecent: GatewaySnapshotMetricSample[];
  revealSnapshotBuildMs: QuantileSample;
  revealSnapshotBytes: QuantileSample;
  revealActiveStreams: number;
  revealChunksSent: number;
  revealCacheEntries: number;
  gatewaySqliteRetryTotal: number;
  colorCollisionRejectedTotal: number;
  loginQueuedTotal: number;
  loginQueueRejectedTotal: number;
  loginAbandonedBeforeAttachTotal: number;
  simulationSubmitTimeoutToleratedTotal: number;
  simulationSubmitTimeoutFlippedTotal: number;
  tileDetailSelfHealTotal: number;
  websocketDisconnectTotal: number;
  websocketAbnormalDisconnectTotal: number;
};

export const createGatewayMetrics = (sampleLimit = 512) => {
  const limit = Math.max(8, sampleLimit);
  const recentLimit = Math.max(8, Math.min(24, Math.floor(limit / 4)));
  const eventLoopDelayMs: number[] = [];
  const gcPauseMs: number[] = [];
  const inputToStateUpdateLatencyMs: number[] = [];
  const commandSubmitLatencyMs: number[] = [];
  const simRpcLatencyMs: number[] = [];
  const gatewaySnapshotTileCount: number[] = [];
  const gatewaySnapshotJsonBytes: number[] = [];
  const gatewaySnapshotTilesJsonBytes: number[] = [];
  const gatewaySnapshotRecent: GatewaySnapshotMetricSample[] = [];
  let gatewayEventLoopMaxMs = 0;
  let gatewayWsSessions = 0;
  let gatewayBackendConnected = 0;
  let gatewayCpuPercent = 0;
  let gatewayRssMb = 0;
  let gatewayHeapUsedMb = 0;
  let gatewayHeapTotalMb = 0;
  let gatewaySnapshotCacheEntries = 0;
  let gatewaySnapshotCacheBytes = 0;
  const revealSnapshotBuildMs: number[] = [];
  const revealSnapshotBytes: number[] = [];
  let revealActiveStreams = 0;
  let revealChunksSent = 0;
  let revealCacheEntries = 0;
  let gatewaySqliteRetryTotal = 0;
  let colorCollisionRejectedTotal = 0;
  let loginQueuedTotal = 0;
  let loginQueueRejectedTotal = 0;
  let loginAbandonedBeforeAttachTotal = 0;
  let simulationSubmitTimeoutToleratedTotal = 0;
  let simulationSubmitTimeoutFlippedTotal = 0;
  let tileDetailSelfHealTotal = 0;
  let websocketDisconnectTotal = 0;
  let websocketAbnormalDisconnectTotal = 0;

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
    gatewaySimRpcLatencyMs: quantileSample(simRpcLatencyMs),
    gatewaySnapshotTileCount: quantileSample(gatewaySnapshotTileCount),
    gatewaySnapshotJsonBytes: quantileSample(gatewaySnapshotJsonBytes),
    gatewaySnapshotTilesJsonBytes: quantileSample(gatewaySnapshotTilesJsonBytes),
    gatewaySnapshotCacheEntries,
    gatewaySnapshotCacheBytes,
    gatewaySnapshotRecent: [...gatewaySnapshotRecent],
    revealSnapshotBuildMs: quantileSample(revealSnapshotBuildMs),
    revealSnapshotBytes: quantileSample(revealSnapshotBytes),
    revealActiveStreams,
    revealChunksSent,
    revealCacheEntries,
    gatewaySqliteRetryTotal,
    colorCollisionRejectedTotal,
    loginQueuedTotal,
    loginQueueRejectedTotal,
    loginAbandonedBeforeAttachTotal,
    simulationSubmitTimeoutToleratedTotal,
    simulationSubmitTimeoutFlippedTotal,
    tileDetailSelfHealTotal,
    websocketDisconnectTotal,
    websocketAbnormalDisconnectTotal
  });

  return {
    setGatewayEventLoopMaxMs(value: number): void {
      gatewayEventLoopMaxMs = clampMetric(value);
    },
    observeGatewayEventLoopDelayMs(value: number): void {
      appendSample(eventLoopDelayMs, value, limit);
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
    setGatewayMemoryUsageMb(values: { rssMb: number; heapUsedMb: number; heapTotalMb: number }): void {
      gatewayRssMb = clampMetric(values.rssMb);
      gatewayHeapUsedMb = clampMetric(values.heapUsedMb);
      gatewayHeapTotalMb = clampMetric(values.heapTotalMb);
    },
    observeGatewayGcPauseMs(value: number): void {
      appendSample(gcPauseMs, value, limit);
    },
    observeGatewayInputToStateUpdateLatencyMs(value: number): void {
      appendSample(inputToStateUpdateLatencyMs, value, limit);
    },
    observeGatewayCommandSubmitLatencyMs(value: number): void {
      appendSample(commandSubmitLatencyMs, value, limit);
    },
    observeGatewaySimRpcLatencyMs(value: number): void {
      appendSample(simRpcLatencyMs, value, limit);
    },
    observeGatewaySnapshotBuild(sample: GatewaySnapshotMetricSample): void {
      appendSample(gatewaySnapshotTileCount, sample.tileCount, limit);
      appendSample(gatewaySnapshotJsonBytes, sample.snapshotJsonBytes, limit);
      appendSample(gatewaySnapshotTilesJsonBytes, sample.tilesJsonBytes, limit);
      appendRecent(gatewaySnapshotRecent, { ...sample }, recentLimit);
    },
    setGatewaySnapshotCache(values: { entries: number; bytes: number }): void {
      gatewaySnapshotCacheEntries = clampMetric(values.entries);
      gatewaySnapshotCacheBytes = clampMetric(values.bytes);
    },
    observeRevealSnapshotBuildMs(value: number): void {
      appendSample(revealSnapshotBuildMs, value, limit);
    },
    observeRevealSnapshotBytes(value: number): void {
      appendSample(revealSnapshotBytes, value, limit);
    },
    setRevealActiveStreams(value: number): void {
      revealActiveStreams = Math.max(0, Math.floor(clampMetric(value)));
    },
    incrementRevealChunksSent(count = 1): void {
      revealChunksSent += Math.max(0, Math.floor(count));
    },
    setRevealCacheEntries(value: number): void {
      revealCacheEntries = Math.max(0, Math.floor(clampMetric(value)));
    },
    incrementGatewaySqliteRetryTotal(count = 1): void {
      gatewaySqliteRetryTotal += Math.max(0, Math.floor(count));
    },
    incrementColorCollisionRejectedTotal(count = 1): void {
      colorCollisionRejectedTotal += Math.max(0, Math.floor(count));
    },
    incrementLoginQueuedTotal(count = 1): void {
      loginQueuedTotal += Math.max(0, Math.floor(count));
    },
    incrementLoginQueueRejectedTotal(count = 1): void {
      loginQueueRejectedTotal += Math.max(0, Math.floor(count));
    },
    incrementLoginAbandonedBeforeAttachTotal(count = 1): void {
      loginAbandonedBeforeAttachTotal += Math.max(0, Math.floor(count));
    },
    incrementSimulationSubmitTimeoutTolerated(count = 1): void {
      simulationSubmitTimeoutToleratedTotal += Math.max(0, Math.floor(count));
    },
    incrementSimulationSubmitTimeoutFlipped(count = 1): void {
      simulationSubmitTimeoutFlippedTotal += Math.max(0, Math.floor(count));
    },
    incrementTileDetailSelfHealTotal(count = 1): void {
      tileDetailSelfHealTotal += Math.max(0, Math.floor(count));
    },
    incrementWebsocketDisconnectTotal(count = 1): void {
      websocketDisconnectTotal += Math.max(0, Math.floor(count));
    },
    incrementWebsocketAbnormalDisconnectTotal(count = 1): void {
      websocketAbnormalDisconnectTotal += Math.max(0, Math.floor(count));
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
        `gateway_sim_rpc_latency_ms{quantile=\"p99\"} ${formatMetricValue(sample.gatewaySimRpcLatencyMs.p99)}`,
        "# TYPE gateway_snapshot_tile_count gauge",
        `gateway_snapshot_tile_count{quantile=\"p50\"} ${formatMetricValue(sample.gatewaySnapshotTileCount.p50)}`,
        `gateway_snapshot_tile_count{quantile=\"p95\"} ${formatMetricValue(sample.gatewaySnapshotTileCount.p95)}`,
        `gateway_snapshot_tile_count{quantile=\"p99\"} ${formatMetricValue(sample.gatewaySnapshotTileCount.p99)}`,
        "# TYPE gateway_snapshot_json_bytes gauge",
        `gateway_snapshot_json_bytes{quantile=\"p50\"} ${formatMetricValue(sample.gatewaySnapshotJsonBytes.p50)}`,
        `gateway_snapshot_json_bytes{quantile=\"p95\"} ${formatMetricValue(sample.gatewaySnapshotJsonBytes.p95)}`,
        `gateway_snapshot_json_bytes{quantile=\"p99\"} ${formatMetricValue(sample.gatewaySnapshotJsonBytes.p99)}`,
        "# TYPE gateway_snapshot_tiles_json_bytes gauge",
        `gateway_snapshot_tiles_json_bytes{quantile=\"p50\"} ${formatMetricValue(sample.gatewaySnapshotTilesJsonBytes.p50)}`,
        `gateway_snapshot_tiles_json_bytes{quantile=\"p95\"} ${formatMetricValue(sample.gatewaySnapshotTilesJsonBytes.p95)}`,
        `gateway_snapshot_tiles_json_bytes{quantile=\"p99\"} ${formatMetricValue(sample.gatewaySnapshotTilesJsonBytes.p99)}`,
        "# TYPE gateway_snapshot_cache_entries gauge",
        `gateway_snapshot_cache_entries ${formatMetricValue(sample.gatewaySnapshotCacheEntries)}`,
        "# TYPE gateway_snapshot_cache_bytes gauge",
        `gateway_snapshot_cache_bytes ${formatMetricValue(sample.gatewaySnapshotCacheBytes)}`,
        "# TYPE gateway_reveal_snapshot_build_ms gauge",
        `gateway_reveal_snapshot_build_ms{quantile=\"p50\"} ${formatMetricValue(sample.revealSnapshotBuildMs.p50)}`,
        `gateway_reveal_snapshot_build_ms{quantile=\"p95\"} ${formatMetricValue(sample.revealSnapshotBuildMs.p95)}`,
        `gateway_reveal_snapshot_build_ms{quantile=\"p99\"} ${formatMetricValue(sample.revealSnapshotBuildMs.p99)}`,
        "# TYPE gateway_reveal_snapshot_bytes gauge",
        `gateway_reveal_snapshot_bytes{quantile=\"p50\"} ${formatMetricValue(sample.revealSnapshotBytes.p50)}`,
        `gateway_reveal_snapshot_bytes{quantile=\"p95\"} ${formatMetricValue(sample.revealSnapshotBytes.p95)}`,
        `gateway_reveal_snapshot_bytes{quantile=\"p99\"} ${formatMetricValue(sample.revealSnapshotBytes.p99)}`,
        "# TYPE gateway_reveal_active_streams gauge",
        `gateway_reveal_active_streams ${formatMetricValue(sample.revealActiveStreams)}`,
        "# TYPE gateway_reveal_chunks_sent counter",
        `gateway_reveal_chunks_sent ${formatMetricValue(sample.revealChunksSent)}`,
        "# TYPE gateway_reveal_cache_entries gauge",
        `gateway_reveal_cache_entries ${formatMetricValue(sample.revealCacheEntries)}`,
        "# TYPE gateway_sqlite_retry_total counter",
        `gateway_sqlite_retry_total ${formatMetricValue(sample.gatewaySqliteRetryTotal)}`,
        "# TYPE gateway_color_collision_rejected_total counter",
        `gateway_color_collision_rejected_total ${formatMetricValue(sample.colorCollisionRejectedTotal)}`,
        "# TYPE gateway_login_queued_total counter",
        `gateway_login_queued_total ${formatMetricValue(sample.loginQueuedTotal)}`,
        "# TYPE gateway_login_queue_rejected_total counter",
        `gateway_login_queue_rejected_total ${formatMetricValue(sample.loginQueueRejectedTotal)}`,
        "# TYPE gateway_login_abandoned_before_attach_total counter",
        `gateway_login_abandoned_before_attach_total ${formatMetricValue(sample.loginAbandonedBeforeAttachTotal)}`,
        "# TYPE gateway_simulation_submit_timeout_tolerated_total counter",
        `gateway_simulation_submit_timeout_tolerated_total ${formatMetricValue(sample.simulationSubmitTimeoutToleratedTotal)}`,
        "# TYPE gateway_simulation_submit_timeout_flipped_total counter",
        `gateway_simulation_submit_timeout_flipped_total ${formatMetricValue(sample.simulationSubmitTimeoutFlippedTotal)}`,
        "# TYPE gateway_tile_detail_self_heal_total counter",
        `gateway_tile_detail_self_heal_total ${formatMetricValue(sample.tileDetailSelfHealTotal)}`,
        "# TYPE gateway_websocket_disconnect_total counter",
        `gateway_websocket_disconnect_total ${formatMetricValue(sample.websocketDisconnectTotal)}`,
        "# TYPE gateway_websocket_abnormal_disconnect_total counter",
        `gateway_websocket_abnormal_disconnect_total ${formatMetricValue(sample.websocketAbnormalDisconnectTotal)}`
      ].join("\n");
    }
  };
};
