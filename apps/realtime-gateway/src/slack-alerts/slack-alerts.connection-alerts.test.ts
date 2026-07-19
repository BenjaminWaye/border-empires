import { describe, expect, it, vi } from "vitest";

import { createSlackAlerter, type RecentEvent, type SlackAlerterOptions } from "./slack-alerts.js";
import type { GatewayMetricsSnapshot } from "../metrics/metrics.js";

// Split out from slack-alerts.test.ts (already at the 500-line file cap) to
// cover alertPlayerDisconnected/alertPlayerReconnected: the "every
// disconnect/reconnect" Slack alerts requested for diagnosing frequent
// reconnect reports. Unlike the other alert types, these intentionally do
// NOT dedupe per-player — every occurrence should reach Slack — so coverage
// here focuses on that "fires every time" behavior plus the shared
// rolling-window flood guard.

const baseMetrics = (): GatewayMetricsSnapshot => ({
  gatewayEventLoopMaxMs: 12,
  gatewayEventLoopDelayMs: { p50: 1.2, p95: 3.4, p99: 8.7 },
  gatewayWsSessions: 2,
  gatewayBackendConnected: 1,
  gatewayCpuPercent: 15,
  gatewayRssMb: 320,
  gatewayHeapUsedMb: 180,
  gatewayHeapTotalMb: 512,
  gatewayGcPauseMs: { p50: 0.5, p95: 2.1, p99: 5.0 },
  gatewayInputToStateUpdateLatencyMs: { p50: 20, p95: 80, p99: 150 },
  gatewayCommandSubmitLatencyMs: { p50: 200, p95: 800, p99: 1500 },
  gatewaySimRpcLatencyMs: { p50: 10, p95: 40, p99: 80 },
  gatewaySnapshotTileCount: { p50: 5000, p95: 5000, p99: 5000 },
  gatewaySnapshotJsonBytes: { p50: 100_000, p95: 100_000, p99: 100_000 },
  gatewaySnapshotTilesJsonBytes: { p50: 50_000, p95: 50_000, p99: 50_000 },
  gatewaySnapshotCacheEntries: 0,
  gatewaySnapshotCacheBytes: 0,
  gatewaySnapshotRecent: [],
  revealSnapshotBuildMs: { p50: 5, p95: 20, p99: 40 },
  revealSnapshotBytes: { p50: 2000, p95: 2000, p99: 2000 },
  revealActiveStreams: 0,
  revealChunksSent: 0,
  revealCacheEntries: 0
});

const fakeFetch = (fn: (url: string, init: RequestInit) => Promise<Response>): typeof fetch => fn as unknown as typeof fetch;
const noEvents = (): readonly RecentEvent[] => [];

const captureFetch = () => {
  const captured: Array<{ url: string; init: RequestInit }> = [];
  const fetch = fakeFetch(async (url, init) => {
    captured.push({ url, init });
    return new Response("ok", { status: 200 });
  });
  return { fetch, captured };
};

const bodyText = (call: { init: RequestInit }): string => {
  const body = JSON.parse(call.init.body as string) as Record<string, unknown>;
  return ((body.blocks as Array<{ text: { text: string } }>)[1]).text.text;
};

const makeAlerter = (overrides: Partial<SlackAlerterOptions> & { fetchImpl: typeof fetch }) =>
  createSlackAlerter({
    webhookUrl: "https://hooks.slack.example/hook",
    dedupeWindowMs: 300_000,
    metricsSnapshot: baseMetrics,
    recentEvents: noEvents,
    now: () => 1000,
    ...overrides
  });

describe("createSlackAlerter connection alerts", () => {
  it("alerts on every disconnect for the same player, unlike the deduped alert types", async () => {
    const { captured, fetch } = captureFetch();
    const alerter = makeAlerter({ fetchImpl: fetch });

    alerter.alertPlayerDisconnected("player-1", { code: 1006, reason: "abnormal closure", isNormalClose: false });
    alerter.alertPlayerDisconnected("player-1", { code: 1006, reason: "abnormal closure", isNormalClose: false });
    alerter.alertPlayerDisconnected("player-1", { code: 1006, reason: "abnormal closure", isNormalClose: false });

    await vi.waitFor(() => captured.length === 3, { timeout: 200 });
    for (const call of captured) {
      expect(call.init.body).toContain("player-1");
    }
  });

  it("includes the close code, reason, and normal/abnormal label", async () => {
    const { captured, fetch } = captureFetch();
    const alerter = makeAlerter({ fetchImpl: fetch });

    alerter.alertPlayerDisconnected("player-2", { code: 1006, reason: "proxy idle timeout", isNormalClose: false });
    await vi.waitFor(() => captured.length === 1, { timeout: 200 });

    const section = bodyText(captured[0]!);
    expect(section).toContain("player-2");
    expect(section).toContain("1006");
    expect(section).toContain("proxy idle timeout");
    expect(section).toContain("abnormal");
    expect(captured[0]!.init.body).toContain(":electric_plug:");
  });

  it("labels a 1000/1001 close as normal", async () => {
    const { captured, fetch } = captureFetch();
    const alerter = makeAlerter({ fetchImpl: fetch });

    alerter.alertPlayerDisconnected("player-3", { code: 1000, reason: "", isNormalClose: true });
    await vi.waitFor(() => captured.length === 1, { timeout: 200 });

    expect(bodyText(captured[0]!)).toContain("normal");
  });

  it("alerts on every reconnect for the same player, unlike the deduped alert types", async () => {
    const { captured, fetch } = captureFetch();
    const alerter = makeAlerter({ fetchImpl: fetch });

    alerter.alertPlayerReconnected("player-4");
    alerter.alertPlayerReconnected("player-4");

    await vi.waitFor(() => captured.length === 2, { timeout: 200 });
    expect(captured[0]!.init.body).toContain(":link:");
  });

  it("caps combined disconnect/reconnect alerts to a rolling per-minute budget so a flood can't spam Slack", async () => {
    const { captured, fetch } = captureFetch();
    const now = vi.fn<() => number>().mockReturnValue(1000);
    const alerter = makeAlerter({ fetchImpl: fetch, now: now as () => number });

    for (let i = 0; i < 40; i += 1) {
      alerter.alertPlayerDisconnected(`player-${i}`, { code: 1006, reason: "", isNormalClose: false });
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(captured.length).toBe(30);

    // Past the 60s window, the budget resets.
    now.mockReturnValue(61_500);
    alerter.alertPlayerReconnected("player-after-reset");
    await vi.waitFor(() => captured.length === 31, { timeout: 200 });
  });

  it("is a no-op without throwing when webhookUrl is unset", () => {
    const alerter = createSlackAlerter({ metricsSnapshot: baseMetrics, recentEvents: noEvents, now: () => 1000 });
    expect(() => alerter.alertPlayerDisconnected("player-x", { code: 1006, reason: "", isNormalClose: false })).not.toThrow();
    expect(() => alerter.alertPlayerReconnected("player-x")).not.toThrow();
  });
});
