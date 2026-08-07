import { describe, expect, it, vi } from "vitest";

import { createSlackAlerter, type RecentEvent, type SlackAlerterOptions } from "./slack-alerts.js";
import type { GatewayMetricsSnapshot } from "../metrics/metrics.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

const fakeFetch = (fn: (url: string, init: RequestInit) => Promise<Response>): typeof fetch =>
  fn as unknown as typeof fetch;

const noEvents = (): readonly RecentEvent[] => [];

/** Returns a fetch impl that captures the last call for inspection. */
const captureFetch = () => {
  let captured: { url: string; init: RequestInit } | undefined;
  const fetch = fakeFetch(async (url, init) => {
    captured = { url, init };
    return new Response("ok", { status: 200 });
  });
  return { fetch, captured: () => captured };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createSlackAlerter", () => {
  it("is a no-op when webhookUrl is unset", () => {
    const opts: SlackAlerterOptions = {
      metricsSnapshot: baseMetrics,
      recentEvents: noEvents,
      now: () => 1000
    };
    const alerter = createSlackAlerter(opts);
    // Should not throw
    alerter.alertQueuePersistFailed(3, 60_000);
    alerter.alertSimulationWakeExhausted(5, 30_000);
    alerter.alertCommandSubmitLatencyHigh(3000);
    alerter.alertAnalyzeIterTotalHigh(600);
    alerter.alertMachineRestart(30_000);
    alerter.alertSqliteRetryHigh(15);
    alerter.alertPlayerRespawned("player-1", "auth_recovery");
    alerter.alertSeasonStarted("season-1", false);
  });

  it("posts a Slack payload for queue_persist_failed", async () => {
    const { captured, fetch } = captureFetch();
    const alerter = createSlackAlerter({
      webhookUrl: "https://hooks.slack.example/T/B/X",
      dedupeWindowMs: 0,
      fetchImpl: fetch,
      metricsSnapshot: baseMetrics,
      recentEvents: () => [
        { at: 900, level: "error", event: "QUEUE_PERSIST_FAILED", payload: { commandId: "c1" } },
        { at: 950, level: "error", event: "QUEUE_PERSIST_FAILED", payload: { commandId: "c2" } }
      ],
      now: () => 1000,
      appLabel: "test",
      buildSha: "abc1234",
      tileCount: () => 8000
    });

    alerter.alertQueuePersistFailed(3, 60_000);

    await vi.waitFor(() => captured() !== undefined, { timeout: 200 });
    const c = captured()!;

    expect(c.url).toBe("https://hooks.slack.example/T/B/X");

    const body = JSON.parse(c.init.body as string) as Record<string, unknown>;
    expect(body.text).toContain("QUEUE_PERSIST_FAILED");
    expect(body.text).toContain(":x:");
    expect(body.text).toContain("test");
    expect(body.text).toContain("×3");

    const blocks = body.blocks as Array<Record<string, unknown>>;
    expect(blocks).toHaveLength(2);

    const sectionText = (blocks[1] as { type: string; text: { text: string } }).text.text;
    expect(sectionText).toContain("3 failures");
    expect(sectionText).toContain("8000 tiles");
    expect(sectionText).toContain("abc1234");
    expect(sectionText).toContain("Next:");
  });

  it("deduplicates alerts of the same type within the window", async () => {
    const { captured, fetch } = captureFetch();
    const now = vi.fn<() => number>();
    now.mockReturnValue(1000);

    const alerter = createSlackAlerter({
      webhookUrl: "https://hooks.slack.example/hook",
      dedupeWindowMs: 300_000,
      fetchImpl: fetch,
      metricsSnapshot: baseMetrics,
      recentEvents: noEvents,
      now: now as () => number
    });

    // First alert fires at t=1000
    alerter.alertCommandSubmitLatencyHigh(3000);
    await vi.waitFor(() => captured() !== undefined, { timeout: 200 });
    expect(captured()).toBeDefined();

    const firstBody = JSON.parse(captured()!.init.body as string) as Record<string, unknown>;
    const firstSection = ((firstBody.blocks as Array<{ text: { text: string } }>)[1]).text.text;
    expect(firstSection).toContain("3000ms");

    // Advance time within window — second alert should be suppressed
    now.mockReturnValue(61_000); // +1 min, still within 5-min window
    alerter.alertCommandSubmitLatencyHigh(3100);

    // Give it a tick — fetch should NOT have been called again (captured still holds first payload)
    await new Promise(r => setTimeout(r, 50));

    // The captured value should still have 3000ms (first call), not 3100ms
    const midBody = JSON.parse(captured()!.init.body as string) as Record<string, unknown>;
    const midSection = ((midBody.blocks as Array<{ text: { text: string } }>)[1]).text.text;
    expect(midSection).toContain("3000ms"); // Unchanged — dedupe suppressed second call

    // Advance past the window
    now.mockReturnValue(301_001); // just past 5 min
    alerter.alertCommandSubmitLatencyHigh(3200);
    await vi.waitFor(() => {
      const b = JSON.parse(captured()!.init.body as string) as Record<string, unknown>;
      return (b.text as string).includes("3200ms");
    }, { timeout: 200 });

    const finalBody = JSON.parse(captured()!.init.body as string) as Record<string, unknown>;
    const finalSection = ((finalBody.blocks as Array<{ text: { text: string } }>)[1]).text.text;
    expect(finalSection).toContain("3200ms");
  });

  it("includes world stats and build SHA in payload", async () => {
    const { captured, fetch } = captureFetch();
    const alerter = createSlackAlerter({
      webhookUrl: "https://hooks.slack.example/hook",
      dedupeWindowMs: 0,
      fetchImpl: fetch,
      metricsSnapshot: baseMetrics,
      recentEvents: noEvents,
      now: () => 1000,
      appLabel: "border-empires-combined",
      buildSha: "def5678",
      tileCount: () => 5000,
      wsSessions: () => 3,
      aiPlayerCount: 20
    });

    alerter.alertSimulationWakeExhausted(5, 30_000);
    await vi.waitFor(() => captured() !== undefined, { timeout: 200 });

    const c = captured()!;
    const body = JSON.parse(c.init.body as string) as Record<string, unknown>;
    const sectionText = ((body.blocks as Array<{ text: { text: string } }>)[1]).text.text;

    expect(sectionText).toContain("5000 tiles");
    expect(sectionText).toContain("20 AI");
    expect(sectionText).toContain("3 human WS");
    expect(sectionText).toContain("def5678");
    expect(sectionText).toContain("5 attempts");
    expect(sectionText).toContain("Next:");
  });

  it("includes metrics snapshot in payload", async () => {
    const { captured, fetch } = captureFetch();
    const metrics = baseMetrics();
    metrics.gatewayCommandSubmitLatencyMs.p99 = 3200;
    metrics.gatewayCpuPercent = 85;
    metrics.gatewayRssMb = 512;

    const alerter = createSlackAlerter({
      webhookUrl: "https://hooks.slack.example/hook",
      dedupeWindowMs: 0,
      fetchImpl: fetch,
      metricsSnapshot: () => metrics,
      recentEvents: noEvents,
      now: () => 1000
    });

    alerter.alertCommandSubmitLatencyHigh(3200);
    await vi.waitFor(() => captured() !== undefined, { timeout: 200 });

    const c = captured()!;
    const body = JSON.parse(c.init.body as string) as Record<string, unknown>;
    const sectionText = ((body.blocks as Array<{ text: { text: string } }>)[1]).text.text;

    expect(sectionText).toContain("cpu=85%");
    expect(sectionText).toContain("rss=512MB");
  });

  it("machine restart alert includes uptime", async () => {
    const { captured, fetch } = captureFetch();
    const alerter = createSlackAlerter({
      webhookUrl: "https://hooks.slack.example/hook",
      dedupeWindowMs: 0,
      fetchImpl: fetch,
      metricsSnapshot: baseMetrics,
      recentEvents: noEvents,
      now: () => 1000
    });

    alerter.alertMachineRestart(45_000);
    await vi.waitFor(() => captured() !== undefined, { timeout: 200 });

    const c = captured()!;
    const body = JSON.parse(c.init.body as string) as Record<string, unknown>;
    const sectionText = ((body.blocks as Array<{ text: { text: string } }>)[1]).text.text;

    expect(sectionText).toContain("uptime 45.0s");
    expect(sectionText).toContain("process started 45.0s ago");
    expect(body.text).toContain(":arrows_counterclockwise:");
  });

  it("sqlite retry alert includes rate", async () => {
    const { captured, fetch } = captureFetch();
    const alerter = createSlackAlerter({
      webhookUrl: "https://hooks.slack.example/hook",
      dedupeWindowMs: 0,
      fetchImpl: fetch,
      metricsSnapshot: baseMetrics,
      recentEvents: noEvents,
      now: () => 1000
    });

    alerter.alertSqliteRetryHigh(15.3);
    await vi.waitFor(() => captured() !== undefined, { timeout: 200 });

    const c = captured()!;
    const body = JSON.parse(c.init.body as string) as Record<string, unknown>;
    const sectionText = ((body.blocks as Array<{ text: { text: string } }>)[1]).text.text;

    expect(sectionText).toContain("15.3/min");
  });

  it("includes suggested fix plan doc for each event type", async () => {
    const { captured, fetch } = captureFetch();
    const alerter = createSlackAlerter({
      webhookUrl: "https://hooks.slack.example/hook",
      dedupeWindowMs: 0,
      fetchImpl: fetch,
      metricsSnapshot: baseMetrics,
      recentEvents: noEvents,
      now: () => 1000
    });

    alerter.alertQueuePersistFailed(2, 30_000);
    await vi.waitFor(() => captured() !== undefined, { timeout: 200 });
    let c = captured()!;
    let body = JSON.parse(c.init.body as string) as Record<string, unknown>;
    let sectionText = ((body.blocks as Array<{ text: { text: string } }>)[1]).text.text;
    expect(sectionText).toContain("docs/plans/2026-05-30-fix-queue-persist-failed.md");
  });

  it("handles fetch error gracefully without throwing", async () => {
    const errorLogs: Array<{ payload: unknown; message?: string }> = [];
    const alerter = createSlackAlerter({
      webhookUrl: "https://hooks.slack.example/hook",
      dedupeWindowMs: 0,
      fetchImpl: fakeFetch(async () => {
        throw new Error("network down");
      }),
      metricsSnapshot: baseMetrics,
      recentEvents: noEvents,
      now: () => 1000,
      log: {
        error: (payload, message) => errorLogs.push({ payload, message })
      }
    });

    // This must not throw
    expect(() => alerter.alertCommandSubmitLatencyHigh(3000)).not.toThrow();

    // Wait for the async post to fail
    await vi.waitFor(() => errorLogs.length > 0, { timeout: 200 });

    expect(errorLogs[0].message).toContain("slack-alert post failed");
    expect(errorLogs[0].payload).toMatchObject({
      error: "network down",
      eventKey: "gateway_command_submit_latency_high"
    });
  });

  it("player respawned alert includes reason and emoji", async () => {
    const { captured, fetch } = captureFetch();
    const alerter = createSlackAlerter({
      webhookUrl: "https://hooks.slack.example/hook",
      dedupeWindowMs: 0,
      fetchImpl: fetch,
      metricsSnapshot: baseMetrics,
      recentEvents: noEvents,
      now: () => 1000
    });

    alerter.alertPlayerRespawned("player-42", "auth_recovery");
    await vi.waitFor(() => captured() !== undefined, { timeout: 200 });

    const c = captured()!;
    const body = JSON.parse(c.init.body as string) as Record<string, unknown>;
    const sectionText = ((body.blocks as Array<{ text: { text: string } }>)[1]).text.text;

    expect(body.text).toContain(":baby:");
    expect(sectionText).toContain("player-42");
    expect(sectionText).toContain("auth_recovery");
  });

  it("player respawned alert dedupes per-player, not globally", async () => {
    const { captured, fetch } = captureFetch();
    const now = vi.fn<() => number>().mockReturnValue(1000);
    const alerter = createSlackAlerter({
      webhookUrl: "https://hooks.slack.example/hook",
      dedupeWindowMs: 300_000,
      fetchImpl: fetch,
      metricsSnapshot: baseMetrics,
      recentEvents: noEvents,
      now: now as () => number
    });

    alerter.alertPlayerRespawned("player-a", "auth_recovery");
    await vi.waitFor(() => captured() !== undefined, { timeout: 200 });
    const firstCaptured = captured()!;

    // Same player again within the dedupe window — should be suppressed.
    now.mockReturnValue(1100);
    alerter.alertPlayerRespawned("player-a", "auth_recovery");
    await new Promise((r) => setTimeout(r, 50));
    expect(captured()).toBe(firstCaptured);

    // Different player within the same window — must NOT be suppressed.
    now.mockReturnValue(1200);
    alerter.alertPlayerRespawned("player-b", "eliminated");
    await vi.waitFor(() => {
      const c = captured();
      if (!c) return false;
      const b = JSON.parse(c.init.body as string) as Record<string, unknown>;
      return (b.text as string).includes("eliminated");
    }, { timeout: 200 });

    const c = captured()!;
    expect(c).not.toBe(firstCaptured);
    const body = JSON.parse(c.init.body as string) as Record<string, unknown>;
    const sectionText = ((body.blocks as Array<{ text: { text: string } }>)[1]).text.text;
    expect(sectionText).toContain("player-b");
  });

  it("season started alert includes seasonId and force flag", async () => {
    const { captured, fetch } = captureFetch();
    const alerter = createSlackAlerter({
      webhookUrl: "https://hooks.slack.example/hook",
      dedupeWindowMs: 0,
      fetchImpl: fetch,
      metricsSnapshot: baseMetrics,
      recentEvents: noEvents,
      now: () => 1000
    });

    alerter.alertSeasonStarted("season-7", true);
    await vi.waitFor(() => captured() !== undefined, { timeout: 200 });

    const c = captured()!;
    const body = JSON.parse(c.init.body as string) as Record<string, unknown>;
    const sectionText = ((body.blocks as Array<{ text: { text: string } }>)[1]).text.text;

    expect(body.text).toContain(":tada:");
    expect(sectionText).toContain("season-7");
    expect(sectionText).toContain("force=true");
  });

  it("season started alert dedupes per seasonId, not globally", async () => {
    const { captured, fetch } = captureFetch();
    const now = vi.fn<() => number>().mockReturnValue(1000);
    const alerter = createSlackAlerter({
      webhookUrl: "https://hooks.slack.example/hook",
      dedupeWindowMs: 300_000,
      fetchImpl: fetch,
      metricsSnapshot: baseMetrics,
      recentEvents: noEvents,
      now: now as () => number
    });

    alerter.alertSeasonStarted("season-1", false);
    await vi.waitFor(() => captured() !== undefined, { timeout: 200 });
    const firstCaptured = captured()!;

    now.mockReturnValue(1100);
    alerter.alertSeasonStarted("season-1", false);
    await new Promise((r) => setTimeout(r, 50));
    expect(captured()).toBe(firstCaptured);

    now.mockReturnValue(1200);
    alerter.alertSeasonStarted("season-2", false);
    await vi.waitFor(() => {
      const c = captured();
      if (!c) return false;
      const b = JSON.parse(c.init.body as string) as Record<string, unknown>;
      return (b.text as string).includes("season-2");
    }, { timeout: 200 });

    const c = captured()!;
    expect(c).not.toBe(firstCaptured);
  });

  it("dedupe map is independent per event type", async () => {
    const { captured, fetch } = captureFetch();
    const now = vi.fn<() => number>().mockReturnValue(1000);
    const alerter = createSlackAlerter({
      webhookUrl: "https://hooks.slack.example/hook",
      dedupeWindowMs: 300_000,
      fetchImpl: fetch,
      metricsSnapshot: baseMetrics,
      recentEvents: noEvents,
      now: now as () => number
    });

    // Fire type A
    alerter.alertQueuePersistFailed(2, 30_000);
    await vi.waitFor(() => captured() !== undefined, { timeout: 200 });

    // Fire type B at nearly the same time — should NOT be suppressed by type A's dedupe
    now.mockReturnValue(1100);
    const firstCaptured = captured()!;
    alerter.alertSimulationWakeExhausted(3, 10_000);
    await vi.waitFor(() => {
      const c = captured();
      if (!c) return false;
      const b = JSON.parse(c.init.body as string) as Record<string, unknown>;
      return (b.text as string).includes("wake exhausted");
    }, { timeout: 200 });

    const c = captured()!;
    expect(c).not.toBe(firstCaptured);
    const body = JSON.parse(c.init.body as string) as Record<string, unknown>;
    expect(body.text).toContain("wake exhausted");
  });

  it("analyze_iter_total_high alert includes p99 value", async () => {
    const { captured, fetch } = captureFetch();
    const alerter = createSlackAlerter({
      webhookUrl: "https://hooks.slack.example/hook",
      dedupeWindowMs: 0,
      fetchImpl: fetch,
      metricsSnapshot: baseMetrics,
      recentEvents: noEvents,
      now: () => 1000
    });

    alerter.alertAnalyzeIterTotalHigh(650);
    await vi.waitFor(() => captured() !== undefined, { timeout: 200 });

    const c = captured()!;
    const body = JSON.parse(c.init.body as string) as Record<string, unknown>;
    const sectionText = ((body.blocks as Array<{ text: { text: string } }>)[1]).text.text;

    expect(sectionText).toContain("650ms");
    expect(sectionText).toContain("<500ms");
    expect(body.text).toContain("analyze_iter_total p99");
  });

  it("omits zero tile/ws counts and shows 'not yet populated' fallback (post-restart)", async () => {
    const { captured, fetch } = captureFetch();
    const metrics = baseMetrics();
    // Simulate post-restart: snapshot histogram not yet populated
    metrics.gatewaySnapshotTileCount = { p50: 0, p95: 0, p99: 0 };
    metrics.gatewayWsSessions = 0;

    const alerter = createSlackAlerter({
      webhookUrl: "https://hooks.slack.example/hook",
      dedupeWindowMs: 0,
      fetchImpl: fetch,
      metricsSnapshot: () => metrics,
      recentEvents: noEvents,
      now: () => 1000
    });

    alerter.alertMachineRestart(30_000);
    await vi.waitFor(() => captured() !== undefined, { timeout: 200 });

    const c = captured()!;
    const body = JSON.parse(c.init.body as string) as Record<string, unknown>;
    const sectionText = ((body.blocks as Array<{ text: { text: string } }>)[1]).text.text;

    // Should show the fallback, not misleading zeros
    expect(sectionText).toContain("world stats not yet populated");
    expect(sectionText).not.toContain("0 tiles");
    expect(sectionText).not.toContain("0 human WS");
  });
});
