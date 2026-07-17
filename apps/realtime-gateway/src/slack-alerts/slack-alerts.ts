/**
 * Slow-event Slack alerter.
 *
 * Detects a curated set of slow/error events in the gateway and posts
 * structured Slack alerts with enough context for a receiving agent to
 * open a GitHub issue (or fix it directly).
 *
 * Dedupe: one alert per event type per dedupe window (default 5 min).
 * Fire-and-forget: `alert()` methods return immediately; the webhook POST
 * runs in the background. If the webhook URL is unset the alerter is a no-op.
 */

import type { GatewayMetricsSnapshot } from "../metrics/metrics.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RecentEvent = {
  at: number;
  level: "info" | "warn" | "error";
  event: string;
  payload: Record<string, unknown>;
};

export type BugReportInput = {
  description: string;
  playerName: string;
  playerId: string;
  clientEvents: Array<{ at: number; level: string; scope: string; event: string; payload: Record<string, unknown> }>;
  serverEvents: RecentEvent[];
  clientContext: Record<string, unknown>;
  metadata: Record<string, unknown>;
};

export type SlackAlerterOptions = {
  /** Slack incoming webhook URL. Unset → no-op. */
  webhookUrl?: string;
  /** Minimum interval between alerts of the same type (ms). Default: 300_000 (5 min). */
  dedupeWindowMs?: number;
  /** Fetch impl override (for tests). */
  fetchImpl?: typeof fetch;
  /** Current gateway metrics snapshot. */
  metricsSnapshot: () => GatewayMetricsSnapshot;
  /** Recent gateway events (ring buffer). */
  recentEvents: () => readonly RecentEvent[];
  /** Logger for non-blocking errors. */
  log?: { error?: (payload: unknown, message?: string) => void };
  /** App label for Slack messages. */
  appLabel?: string;
  /** Build SHA for context. */
  buildSha?: string;
  /** Current world tile count. */
  tileCount?: () => number;
  /** Active WS sessions. */
  wsSessions?: () => number;
  /** Number of AI players in this world. */
  aiPlayerCount?: number;
  /** Override Date.now for tests. */
  now?: () => number;
};

export type SlackAlerter = {
  /** QUEUE_PERSIST_FAILED fired N times in the last windowMs. */
  alertQueuePersistFailed: (count: number, windowMs: number) => void;
  /** simulation_wake_exhausted fired after all wake attempts. */
  alertSimulationWakeExhausted: (attempts: number, timeoutMs: number) => void;
  /** gateway_command_submit_latency_ms p99 > threshold. */
  alertCommandSubmitLatencyHigh: (p99: number) => void;
  /** analyze_iter_total p99 > threshold (from sim metrics poll). */
  alertAnalyzeIterTotalHigh: (p99: number) => void;
  /** Machine restart detected (uptime < 60s). */
  alertMachineRestart: (uptimeMs: number) => void;
  /** gateway_sqlite_retry_total rate > threshold per minute. */
  alertSqliteRetryHigh: (ratePerMin: number) => void;
  /** Player-submitted bug report. */
  alertPlayerBugReport: (report: BugReportInput) => void;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_DEDUPE_WINDOW_MS = 300_000; // 5 min
const POST_TIMEOUT_MS = 5_000;
const RECENT_EVENT_LIMIT = 5;

const SUGGESTED_FIX_BY_EVENT: Record<string, string> = {
  gateway_command_submit_latency_high: "docs/plans/2026-06-01-ai-time-budget-cap.md",
  analyze_iter_total_high: "docs/plans/2026-06-01-ai-time-budget-cap.md",
  queue_persist_failed: "docs/plans/2026-05-30-fix-queue-persist-failed.md",
  simulation_wake_exhausted: "docs/plans/2026-05-29-ai-planner-cost-cap.md",
  machine_restart: "investigate exit_code; if 137 oom_killed=true, RAM",
  sqlite_retry_high: "docs/plans/2026-05-30-fix-queue-persist-failed.md"
};

const EMOJI_BY_EVENT: Record<string, string> = {
  gateway_command_submit_latency_high: ":rotating_light:",
  analyze_iter_total_high: ":rotating_light:",
  queue_persist_failed: ":x:",
  simulation_wake_exhausted: ":zzz:",
  machine_restart: ":arrows_counterclockwise:",
  sqlite_retry_high: ":warning:"
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmtMs = (ms: number): string =>
  ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms.toFixed(0)}ms`;

const fmtCount = (n: number): string => String(Math.max(0, Math.floor(n)));

// ---------------------------------------------------------------------------
// Payload builder
// ---------------------------------------------------------------------------

const buildAlertPayload = (input: {
  appLabel: string;
  eventName: string;
  summary: string;
  currentValue: string;
  targetLabel: string;
  triggerDetail: string;
  tileCount: number | undefined;
  wsSessions: number | undefined;
  aiPlayerCount: number | undefined;
  buildSha: string | undefined;
  recentEvents: readonly RecentEvent[];
  metrics: GatewayMetricsSnapshot;
}): Record<string, unknown> => {
  const {
    appLabel,
    eventName,
    summary,
    currentValue,
    targetLabel,
    triggerDetail,
    tileCount,
    wsSessions,
    aiPlayerCount,
    buildSha,
    recentEvents,
    metrics
  } = input;

  const emoji = EMOJI_BY_EVENT[eventName] ?? ":warning:";
  const suggestedFix = SUGGESTED_FIX_BY_EVENT[eventName];

  // World stats line
  const worldParts: string[] = [];
  if (tileCount !== undefined && tileCount > 0) worldParts.push(`${fmtCount(tileCount)} tiles`);
  if (aiPlayerCount !== undefined) worldParts.push(`${fmtCount(aiPlayerCount)} AI`);
  if (wsSessions !== undefined && wsSessions > 0) worldParts.push(`${fmtCount(wsSessions)} human WS`);
  const worldLine = worldParts.length > 0
    ? worldParts.join(", ")
    : "(world stats not yet populated — no auth bootstrap or WS sessions since restart)";

  // Recent events summary
  let recentLine = "(none)";
  if (recentEvents.length > 0) {
    const byEvent = new Map<string, number>();
    for (const evt of recentEvents) {
      byEvent.set(evt.event, (byEvent.get(evt.event) ?? 0) + 1);
    }
    const parts = [...byEvent.entries()]
      .slice(0, RECENT_EVENT_LIMIT)
      .map(([name, count]) => `${name} ×${count}`);
    recentLine = parts.join(", ");
  }

  // Metrics snapshot (compact)
  const metricsLine = [
    `loop_max=${metrics.gatewayEventLoopMaxMs}ms`,
    `loop_p99=${metrics.gatewayEventLoopDelayMs.p99.toFixed(1)}`,
    `gc_p99=${metrics.gatewayGcPauseMs.p99.toFixed(1)}`,
    `sim_rpc_p99=${metrics.gatewaySimRpcLatencyMs.p99.toFixed(1)}`,
    `cpu=${metrics.gatewayCpuPercent.toFixed(0)}%`,
    `rss=${metrics.gatewayRssMb.toFixed(0)}MB`
  ].join(" ");

  const headerText = `${emoji} ${appLabel} *${summary}*`;
  const bodyLines: string[] = [];

  bodyLines.push(`*Current:* ${currentValue} (target ${targetLabel})`);
  bodyLines.push(`*Trigger:* ${triggerDetail}`);
  if (worldLine) bodyLines.push(`*World:* ${worldLine}`);
  bodyLines.push(`*Metrics:* \`${metricsLine}\``);
  bodyLines.push(`*Recent events:* ${recentLine}`);
  if (buildSha) bodyLines.push(`*Build:* \`${buildSha}\``);
  if (suggestedFix) bodyLines.push(`*Next:* ${suggestedFix}`);

  return {
    text: headerText,
    blocks: [
      { type: "header", text: { type: "plain_text", text: headerText, emoji: true } },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: bodyLines.join("\n")
        }
      }
    ]
  };
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export const createSlackAlerter = (options: SlackAlerterOptions): SlackAlerter => {
  const webhookUrl = options.webhookUrl?.trim();
  const dedupeWindowMs = options.dedupeWindowMs ?? DEFAULT_DEDUPE_WINDOW_MS;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const appLabel = options.appLabel ?? "border-empires-gateway";
  const now = options.now ?? (() => Date.now());
  const log = options.log;

  // Dedupe state: eventKey → lastSentAt
  const lastSent = new Map<string, number>();

  /** Check dedupe window. Returns true if the alert should fire. */
  const shouldFire = (eventKey: string): boolean => {
    const last = lastSent.get(eventKey);
    if (last !== undefined && now() - last < dedupeWindowMs) return false;
    return true;
  };

  /** Mark an event type as having been sent. */
  const markSent = (eventKey: string): void => {
    lastSent.set(eventKey, now());
  };

  /** Fire-and-forget Slack POST. */
  const post = async (eventKey: string, payload: Record<string, unknown>): Promise<void> => {
    if (!webhookUrl || !fetchImpl) return;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), POST_TIMEOUT_MS);
    try {
      const res = await fetchImpl(webhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: ac.signal
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        log?.error?.(
          { status: res.status, body: body.slice(0, 200), eventKey },
          "slack-alert returned non-2xx"
        );
      }
    } catch (err) {
      log?.error?.(
        { error: err instanceof Error ? err.message : String(err), eventKey },
        "slack-alert post failed"
      );
    } finally {
      clearTimeout(timer);
    }
  };

  const alert = (eventKey: string, input: {
    summary: string;
    currentValue: string;
    targetLabel: string;
    triggerDetail: string;
  }): void => {
    if (!shouldFire(eventKey)) return;
    markSent(eventKey);

    const metrics = options.metricsSnapshot();
    const recentEvents = options.recentEvents().slice(-RECENT_EVENT_LIMIT);

    const payload = buildAlertPayload({
      appLabel,
      eventName: eventKey,
      summary: input.summary,
      currentValue: input.currentValue,
      targetLabel: input.targetLabel,
      triggerDetail: input.triggerDetail,
      tileCount: options.tileCount?.() ?? metrics.gatewaySnapshotTileCount.p50,
      wsSessions: options.wsSessions?.() ?? metrics.gatewayWsSessions,
      aiPlayerCount: options.aiPlayerCount,
      buildSha: options.buildSha,
      recentEvents,
      metrics
    });

    void post(eventKey, payload);
  };

  return {
    alertQueuePersistFailed(count: number, windowMs: number): void {
      alert("queue_persist_failed", {
        summary: `QUEUE_PERSIST_FAILED ×${count}`,
        currentValue: `${count} failures`,
        targetLabel: "0 failures",
        triggerDetail: `${count} failures in last ${fmtMs(windowMs)}`
      });
    },

    alertSimulationWakeExhausted(attempts: number, timeoutMs: number): void {
      alert("simulation_wake_exhausted", {
        summary: "simulation wake exhausted",
        currentValue: `${attempts} attempts`,
        targetLabel: "connected",
        triggerDetail: `all ${attempts} wake attempts failed within ${fmtMs(timeoutMs)}`
      });
    },

    alertCommandSubmitLatencyHigh(p99: number): void {
      alert("gateway_command_submit_latency_high", {
        summary: "command submit latency p99 > 2500ms",
        currentValue: `${p99.toFixed(0)}ms`,
        targetLabel: "<2500ms",
        triggerDetail: "p99 exceeded 2500ms threshold"
      });
    },

    alertAnalyzeIterTotalHigh(p99: number): void {
      alert("analyze_iter_total_high", {
        summary: "analyze_iter_total p99 > 500ms",
        currentValue: `${p99.toFixed(0)}ms`,
        targetLabel: "<500ms",
        triggerDetail: "p99 exceeded 500ms threshold"
      });
    },

    alertMachineRestart(uptimeMs: number): void {
      const uptimeLabel = uptimeMs < 60_000
        ? `${(uptimeMs / 1000).toFixed(1)}s`
        : `${(uptimeMs / 60_000).toFixed(1)}min`;
      alert("machine_restart", {
        summary: "machine restart detected",
        currentValue: `uptime ${uptimeLabel}`,
        targetLabel: "no recent restart",
        triggerDetail: `process started ${fmtMs(uptimeMs)} ago`
      });
    },

    alertSqliteRetryHigh(ratePerMin: number): void {
      alert("sqlite_retry_high", {
        summary: `SQLite retry rate > 10/min`,
        currentValue: `${ratePerMin.toFixed(1)}/min`,
        targetLabel: "<10/min",
        triggerDetail: `rate exceeded 10/min threshold`
      });
    },

    alertPlayerBugReport(report: BugReportInput): void {
      const serverErrorEvents = report.serverEvents.filter((e) => e.level === "error");
      const serverWarnEvents = report.serverEvents.filter((e) => e.level === "warn");
      const clientErrorEvents = report.clientEvents.filter((e) => e.level === "error");
      const recentServerErrors = serverErrorEvents.slice(-5).map((e) => `  \`${e.event}\` ${e.payload.commandId ? `cmd:${e.payload.commandId}` : ""}`).join("\n");
      const recentClientErrors = clientErrorEvents.slice(-5).map((e) => `  \`${e.scope}/${e.event}\``).join("\n");

      const headerText = `:bug: ${appLabel} *Player bug report*`;
      const bodyLines: string[] = [];
      bodyLines.push(`*Player:* ${report.playerName || "unknown"} (\`${report.playerId}\`)`);
      bodyLines.push(`*Description:* ${report.description.slice(0, 500)}`);
      bodyLines.push(`*Server events:* ${report.serverEvents.length} total (${serverErrorEvents.length} errors, ${serverWarnEvents.length} warnings)`);
      bodyLines.push(`*Client events:* ${report.clientEvents.length} total (${clientErrorEvents.length} errors)`);
      if (recentServerErrors) bodyLines.push(`*Recent server errors:*\n${recentServerErrors}`);
      if (recentClientErrors) bodyLines.push(`*Recent client errors:*\n${recentClientErrors}`);
      if (options.buildSha) bodyLines.push(`*Build:* \`${options.buildSha}\``);

      const payload = {
        text: headerText,
        blocks: [
          { type: "header", text: { type: "plain_text", text: headerText, emoji: true } },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: bodyLines.join("\n")
            }
          }
        ]
      };

      void post("player_bug_report", payload);
    }
  };
};
