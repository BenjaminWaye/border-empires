import { describe, expect, it } from "vitest";

import { createGatewayMetrics } from "./metrics.js";

describe("gateway metrics", () => {
  it("tracks transport latencies and snapshot diagnostics", () => {
    const metrics = createGatewayMetrics();
    metrics.setGatewayEventLoopMaxMs(12);
    metrics.observeGatewayEventLoopDelayMs(3);
    metrics.observeGatewayEventLoopDelayMs(9);
    metrics.setGatewayWsSessions(7);
    metrics.setGatewayBackendConnected(true);
    metrics.setGatewayCpuPercent(22.4);
    metrics.setGatewayMemoryUsageMb({ rssMb: 256, heapUsedMb: 88, heapTotalMb: 144 });
    metrics.observeGatewayGcPauseMs(2);
    metrics.observeGatewayGcPauseMs(7);
    metrics.observeGatewayInputToStateUpdateLatencyMs(10);
    metrics.observeGatewayInputToStateUpdateLatencyMs(30);
    metrics.observeGatewayCommandSubmitLatencyMs(4);
    metrics.observeGatewayCommandSubmitLatencyMs(9);
    metrics.observeGatewaySimRpcLatencyMs(14);
    metrics.observeGatewaySimRpcLatencyMs(28);
    metrics.setGatewaySnapshotCache({ entries: 2, bytes: 8192 });
    metrics.observeGatewaySnapshotBuild({
      trigger: "gateway_auth_bootstrap",
      playerId: "player-1",
      fullVisibility: 0,
      tileCount: 320,
      snapshotJsonBytes: 2048,
      tilesJsonBytes: 1800,
      worldStatusJsonBytes: 120,
      cacheEntries: 2,
      cacheBytes: 8192,
      socketCount: 1,
      rssMb: 256,
      heapUsedMb: 88
    });
    metrics.observeGatewaySnapshotBuild({
      trigger: "gateway_fog_refresh",
      playerId: "player-1",
      fullVisibility: 1,
      tileCount: 640,
      snapshotJsonBytes: 4096,
      tilesJsonBytes: 3600,
      worldStatusJsonBytes: 180,
      cacheEntries: 2,
      cacheBytes: 8192,
      socketCount: 2,
      rssMb: 260,
      heapUsedMb: 92
    });

    const sample = metrics.snapshot();
    expect(sample.gatewayEventLoopMaxMs).toBe(12);
    expect(sample.gatewayEventLoopDelayMs.p95).toBe(9);
    expect(sample.gatewayWsSessions).toBe(7);
    expect(sample.gatewayBackendConnected).toBe(1);
    expect(sample.gatewayCpuPercent).toBe(22.4);
    expect(sample.gatewayRssMb).toBe(256);
    expect(sample.gatewayHeapUsedMb).toBe(88);
    expect(sample.gatewayHeapTotalMb).toBe(144);
    expect(sample.gatewayGcPauseMs.p95).toBe(7);
    expect(sample.gatewayInputToStateUpdateLatencyMs.p95).toBe(30);
    expect(sample.gatewayCommandSubmitLatencyMs.p95).toBe(9);
    expect(sample.gatewaySimRpcLatencyMs.p95).toBe(28);
    expect(sample.gatewaySnapshotTileCount.p95).toBe(640);
    expect(sample.gatewaySnapshotJsonBytes.p95).toBe(4096);
    expect(sample.gatewaySnapshotTilesJsonBytes.p95).toBe(3600);
    expect(sample.gatewaySnapshotCacheEntries).toBe(2);
    expect(sample.gatewaySnapshotCacheBytes).toBe(8192);
    expect(sample.gatewaySnapshotRecent.at(-1)?.trigger).toBe("gateway_fog_refresh");

    const exposition = metrics.renderPrometheus();
    expect(exposition).toContain("gateway_event_loop_max_ms 12");
    expect(exposition).toContain('gateway_gc_pause_ms{quantile="p95"}');
    expect(exposition).toContain('gateway_input_to_state_update_latency_ms{quantile="p95"}');
    expect(exposition).toContain('gateway_command_submit_latency_ms{quantile="p95"}');
    expect(exposition).toContain('gateway_snapshot_json_bytes{quantile="p95"}');
    expect(exposition).toContain("gateway_snapshot_cache_bytes 8192");
  });

  it("tracks reveal-map snapshot build, fanout, and active-stream counters", () => {
    const metrics = createGatewayMetrics();
    metrics.observeRevealSnapshotBuildMs(120);
    metrics.observeRevealSnapshotBuildMs(180);
    metrics.observeRevealSnapshotBytes(1_500_000);
    metrics.observeRevealSnapshotBytes(1_800_000);
    metrics.setRevealActiveStreams(3);
    metrics.incrementRevealChunksSent(4);
    metrics.incrementRevealChunksSent(2);
    metrics.setRevealCacheEntries(1);

    const sample = metrics.snapshot();
    expect(sample.revealSnapshotBuildMs.p95).toBe(180);
    expect(sample.revealSnapshotBytes.p95).toBe(1_800_000);
    expect(sample.revealActiveStreams).toBe(3);
    expect(sample.revealChunksSent).toBe(6);
    expect(sample.revealCacheEntries).toBe(1);

    const exposition = metrics.renderPrometheus();
    expect(exposition).toContain('gateway_reveal_snapshot_build_ms{quantile="p95"} 180');
    expect(exposition).toContain('gateway_reveal_snapshot_bytes{quantile="p95"} 1800000');
    expect(exposition).toContain("gateway_reveal_active_streams 3");
    expect(exposition).toContain("gateway_reveal_chunks_sent 6");
    expect(exposition).toContain("gateway_reveal_cache_entries 1");
  });

  it("tracks websocket disconnect totals, split out by abnormal closes", () => {
    const metrics = createGatewayMetrics();
    metrics.incrementWebsocketDisconnectTotal();
    metrics.incrementWebsocketDisconnectTotal();
    metrics.incrementWebsocketAbnormalDisconnectTotal();

    const sample = metrics.snapshot();
    expect(sample.websocketDisconnectTotal).toBe(2);
    expect(sample.websocketAbnormalDisconnectTotal).toBe(1);

    const exposition = metrics.renderPrometheus();
    expect(exposition).toContain("gateway_websocket_disconnect_total 2");
    expect(exposition).toContain("gateway_websocket_abnormal_disconnect_total 1");
  });
});
