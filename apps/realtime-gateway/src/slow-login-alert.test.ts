import { describe, expect, it, vi } from "vitest";

import { createSlowLoginAlerter, type SlowLoginRecentEvent } from "./slow-login-alert.js";
import type { GatewayMetricsSnapshot } from "./metrics.js";

const baseMetrics = (): GatewayMetricsSnapshot => ({
  gatewayEventLoopMaxMs: 1234,
  gatewayEventLoopDelayMs: { p50: 0, p95: 1, p99: 12 },
  gatewayWsSessions: 7,
  gatewayBackendConnected: 1,
  gatewayCpuPercent: 4.5,
  gatewayRssMb: 280,
  gatewayHeapUsedMb: 180,
  gatewayHeapTotalMb: 220,
  gatewayGcPauseMs: { p50: 1, p95: 5, p99: 60 },
  gatewayInputToStateUpdateLatencyMs: { p50: 0, p95: 0, p99: 0 },
  gatewayCommandSubmitLatencyMs: { p50: 0, p95: 0, p99: 0 },
  gatewaySimRpcLatencyMs: { p50: 0, p95: 5, p99: 20 },
  gatewaySnapshotTileCount: { p50: 0, p95: 0, p99: 0 },
  gatewaySnapshotJsonBytes: { p50: 0, p95: 0, p99: 0 },
  gatewaySnapshotTilesJsonBytes: { p50: 0, p95: 0, p99: 0 },
  gatewaySnapshotCacheEntries: 0,
  gatewaySnapshotCacheBytes: 0,
  gatewaySnapshotRecent: []
});

const fakeFetch = (impl: (url: string, init: RequestInit) => Promise<Response>) =>
  vi.fn(impl) as unknown as typeof fetch;

const flushPending = async (): Promise<void> => {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
};

describe("createSlowLoginAlerter", () => {
  it("does not POST when total elapsed is under threshold", async () => {
    let nowMs = 1000;
    const fetchImpl = fakeFetch(async () => new Response("ok", { status: 200 }));
    const alerter = createSlowLoginAlerter({
      webhookUrl: "https://example.com/hook",
      thresholdMs: 60_000,
      fetchImpl,
      metricsSnapshot: baseMetrics,
      recentEvents: () => [],
      now: () => nowMs
    });
    const handle = alerter.begin("control");
    handle.setPlayerId("player-1");
    handle.startStep("prepare_player");
    nowMs += 1_000;
    handle.endStep("prepare_player");
    handle.complete("init_sent");
    await flushPending();
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });

  it("posts a Slack payload when total elapsed exceeds threshold", async () => {
    let nowMs = 1000;
    let captured: { url: string; init: RequestInit } | undefined;
    const fetchImpl = fakeFetch(async (url, init) => {
      captured = { url, init };
      return new Response("ok", { status: 200 });
    });
    const events: SlowLoginRecentEvent[] = [
      { at: 1500, level: "info", event: "gateway_auth_prepare_started", payload: { playerId: "player-1" } },
      { at: 65_000, level: "warn", event: "gateway_auth_subscribe_retry", payload: { playerId: "player-1", attempt: 2 } }
    ];
    const alerter = createSlowLoginAlerter({
      webhookUrl: "https://hooks.slack.example/T/B/X",
      thresholdMs: 60_000,
      fetchImpl,
      metricsSnapshot: baseMetrics,
      recentEvents: () => events,
      now: () => nowMs,
      appLabel: "border-empires-test"
    });
    const handle = alerter.begin("control");
    handle.setPlayerId("player-1");
    handle.startStep("prepare_player");
    nowMs += 5_000;
    handle.endStep("prepare_player");
    handle.startStep("bootstrap_subscribe");
    nowMs += 60_000;
    handle.endStep("bootstrap_subscribe");
    handle.complete("init_sent");
    await flushPending();
    expect(captured).toBeDefined();
    expect(captured!.url).toBe("https://hooks.slack.example/T/B/X");
    const body = JSON.parse(captured!.init.body as string) as Record<string, unknown>;
    expect(body.text).toMatch(/Slow login: \d+\.\ds on border-empires-test/);
    const blocks = body.blocks as Array<Record<string, unknown>>;
    expect(blocks.find((b) => b.type === "section" && JSON.stringify(b).includes("prepare_player"))).toBeTruthy();
    expect(blocks.find((b) => b.type === "section" && JSON.stringify(b).includes("event_loop_max_ms=1234"))).toBeTruthy();
  });

  it("respects cooldown so back-to-back slow logins only fire once", async () => {
    let nowMs = 1000;
    const fetchImpl = fakeFetch(async () => new Response("ok", { status: 200 }));
    const alerter = createSlowLoginAlerter({
      webhookUrl: "https://example.com/hook",
      thresholdMs: 60_000,
      cooldownMs: 600_000,
      fetchImpl,
      metricsSnapshot: baseMetrics,
      recentEvents: () => [],
      now: () => nowMs
    });
    const trip = (): void => {
      const handle = alerter.begin("control");
      handle.startStep("bootstrap_subscribe");
      nowMs += 90_000;
      handle.endStep("bootstrap_subscribe");
      handle.complete("init_sent");
    };
    trip();
    await flushPending();
    nowMs += 1_000;
    trip();
    await flushPending();
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });

  it("is a no-op when webhookUrl is unset", async () => {
    let nowMs = 1000;
    const fetchImpl = fakeFetch(async () => new Response("ok", { status: 200 }));
    const alerter = createSlowLoginAlerter({
      thresholdMs: 60_000,
      fetchImpl,
      metricsSnapshot: baseMetrics,
      recentEvents: () => [],
      now: () => nowMs
    });
    const handle = alerter.begin("control");
    handle.startStep("bootstrap_subscribe");
    nowMs += 120_000;
    handle.endStep("bootstrap_subscribe");
    handle.complete("init_sent");
    await flushPending();
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });

  it("closes in-flight steps as failed when complete() is reached", async () => {
    let nowMs = 1000;
    let captured: RequestInit | undefined;
    const fetchImpl = fakeFetch(async (_url, init) => {
      captured = init;
      return new Response("ok", { status: 200 });
    });
    const alerter = createSlowLoginAlerter({
      webhookUrl: "https://example.com/hook",
      thresholdMs: 1_000,
      fetchImpl,
      metricsSnapshot: baseMetrics,
      recentEvents: () => [],
      now: () => nowMs
    });
    const handle = alerter.begin("control");
    handle.startStep("bootstrap_subscribe");
    nowMs += 5_000;
    handle.complete("rejected", "bootstrap_failed");
    await flushPending();
    const body = JSON.parse(captured!.body as string) as Record<string, unknown>;
    expect(JSON.stringify(body.blocks)).toMatch(/bootstrap_subscribe.*✗/);
  });
});
