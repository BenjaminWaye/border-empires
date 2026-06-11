/**
 * Slow-login alerter.
 *
 * Tracks per-session AUTH→INIT timing in the gateway. When a session crosses
 * the configured threshold (default 60s) the alerter posts a structured
 * summary to a Slack incoming webhook with: per-step durations, the gateway
 * metrics snapshot at fire time, and the last few `recentGatewayEvents`
 * entries scoped to the session/player.
 *
 * The alerter is fire-and-forget — `complete()` returns immediately; the
 * webhook POST runs in the background with a hard timeout. If the webhook
 * URL is unset the alerter is a no-op (useful for local/test runs).
 */

import type { GatewayMetricsSnapshot } from "../metrics/metrics.js";

export type SlowLoginRecentEvent = {
  at: number;
  level: "info" | "warn" | "error";
  event: string;
  payload: Record<string, unknown>;
};

export type AuthFlowStep = {
  name: string;
  startedAt: number;
  durationMs: number;
  ok: boolean;
};

export type SlowLoginAlerterOptions = {
  webhookUrl?: string;
  thresholdMs?: number;
  /** Minimum delay between webhook fires; defaults to 30s to avoid spam. */
  cooldownMs?: number;
  fetchImpl?: typeof fetch;
  metricsSnapshot: () => GatewayMetricsSnapshot;
  recentEvents: () => readonly SlowLoginRecentEvent[];
  log?: { error?: (payload: unknown, message?: string) => void };
  appLabel?: string;
  /** Override Date.now for tests. */
  now?: () => number;
};

export type SlowLoginCompleteOutcome = "init_sent" | "rejected";

export type SlowLoginAuthHandle = {
  setPlayerId: (playerId: string) => void;
  startStep: (name: string) => void;
  endStep: (name: string, ok?: boolean) => void;
  complete: (outcome: SlowLoginCompleteOutcome, reason?: string) => void;
};

export type SlowLoginAlerter = {
  begin: (channel: string, correlationId?: string) => SlowLoginAuthHandle;
};

const DEFAULT_THRESHOLD_MS = 60_000;
const DEFAULT_COOLDOWN_MS = 30_000;
const POST_TIMEOUT_MS = 5_000;
const EVENT_LOG_BUDGET_BYTES = 2_500;

const fmt = (n: number): string => (Number.isFinite(n) ? n.toFixed(1) : String(n));

const buildSlackPayload = (input: {
  appLabel: string;
  trace: {
    channel: string;
    correlationId: string | undefined;
    authReceivedAt: number;
    playerId: string | undefined;
    steps: AuthFlowStep[];
  };
  outcome: SlowLoginCompleteOutcome;
  reason: string | undefined;
  totalElapsedMs: number;
  thresholdMs: number;
  metrics: GatewayMetricsSnapshot;
  sessionEvents: readonly SlowLoginRecentEvent[];
}): Record<string, unknown> => {
  const { appLabel, trace, outcome, reason, totalElapsedMs, thresholdMs, metrics, sessionEvents } = input;
  const headerText = `Slow login: ${(totalElapsedMs / 1000).toFixed(1)}s on ${appLabel}`;
  const stepLines = trace.steps.length
    ? trace.steps.map((step) => `  • ${step.name}: ${step.durationMs}ms${step.ok ? "" : " ✗"}`).join("\n")
    : "(no per-step data)";

  let eventBudget = EVENT_LOG_BUDGET_BYTES;
  const eventLines: string[] = [];
  for (const evt of sessionEvents) {
    const offset = evt.at - trace.authReceivedAt;
    const payloadStr = JSON.stringify(evt.payload);
    const trimmed = payloadStr.length > 240 ? `${payloadStr.slice(0, 240)}…` : payloadStr;
    const line = `+${offset}ms [${evt.level}] ${evt.event} ${trimmed}`;
    if (line.length + 1 > eventBudget) break;
    eventBudget -= line.length + 1;
    eventLines.push(line);
  }

  const metricsLines = [
    `event_loop_max_ms=${metrics.gatewayEventLoopMaxMs}`,
    `event_loop_p99=${fmt(metrics.gatewayEventLoopDelayMs.p99)}`,
    `gc_pause_p99=${fmt(metrics.gatewayGcPauseMs.p99)}`,
    `sim_rpc_p99=${fmt(metrics.gatewaySimRpcLatencyMs.p99)}`,
    `input_to_state_p99=${fmt(metrics.gatewayInputToStateUpdateLatencyMs.p99)}`,
    `cpu=${fmt(metrics.gatewayCpuPercent)}%`,
    `rss=${fmt(metrics.gatewayRssMb)}MB`,
    `heap_used=${fmt(metrics.gatewayHeapUsedMb)}MB`,
    `ws_sessions=${metrics.gatewayWsSessions}`,
    `backend_connected=${metrics.gatewayBackendConnected}`
  ].join(" ");

  return {
    text: headerText,
    blocks: [
      { type: "header", text: { type: "plain_text", text: headerText } },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Player:* \`${trace.playerId ?? "unauthenticated"}\`` },
          { type: "mrkdwn", text: `*Channel:* \`${trace.channel}\`` },
          ...(trace.correlationId ? [{ type: "mrkdwn", text: `*CorrelationId:* \`${trace.correlationId}\`` }] : []),
          { type: "mrkdwn", text: `*Outcome:* ${outcome}${reason ? ` — ${reason}` : ""}` },
          {
            type: "mrkdwn",
            text: `*Total:* ${(totalElapsedMs / 1000).toFixed(1)}s (threshold ${(thresholdMs / 1000).toFixed(0)}s)`
          }
        ]
      },
      { type: "section", text: { type: "mrkdwn", text: `*Steps*\n\`\`\`${stepLines}\`\`\`` } },
      { type: "section", text: { type: "mrkdwn", text: `*Metrics*\n\`\`\`${metricsLines}\`\`\`` } },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Events*\n\`\`\`${eventLines.length > 0 ? eventLines.join("\n") : "(none)"}\`\`\``
        }
      }
    ]
  };
};

export const createSlowLoginAlerter = (options: SlowLoginAlerterOptions): SlowLoginAlerter => {
  const thresholdMs = options.thresholdMs ?? DEFAULT_THRESHOLD_MS;
  const cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  const webhookUrl = options.webhookUrl?.trim();
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const appLabel = options.appLabel ?? "border-empires-gateway";
  const now = options.now ?? (() => Date.now());
  const log = options.log;
  let lastFiredAt = 0;

  const post = async (
    trace: { channel: string; correlationId: string | undefined; authReceivedAt: number; playerId: string | undefined; steps: AuthFlowStep[] },
    outcome: SlowLoginCompleteOutcome,
    reason: string | undefined,
    totalElapsedMs: number
  ): Promise<void> => {
    if (!webhookUrl || !fetchImpl) return;
    if (lastFiredAt > 0) {
      const since = now() - lastFiredAt;
      if (since < cooldownMs) return;
    }
    lastFiredAt = now();
    const metrics = options.metricsSnapshot();
    const events = options.recentEvents();
    const sessionEvents = events
      .filter((evt) => {
        if (evt.at < trace.authReceivedAt) return false;
        if (trace.playerId && evt.payload.playerId !== undefined && evt.payload.playerId !== trace.playerId) {
          return false;
        }
        return true;
      })
      .slice(-25);
    const payload = buildSlackPayload({
      appLabel,
      trace,
      outcome,
      reason,
      totalElapsedMs,
      thresholdMs,
      metrics,
      sessionEvents
    });
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
          { status: res.status, body: body.slice(0, 200) },
          "slow-login slack alert returned non-2xx"
        );
      }
    } catch (err) {
      log?.error?.(
        { error: err instanceof Error ? err.message : String(err) },
        "slow-login slack alert post failed"
      );
    } finally {
      clearTimeout(timer);
    }
  };

  return {
    begin(channel: string, correlationId?: string): SlowLoginAuthHandle {
      const trace = {
        channel,
        correlationId,
        authReceivedAt: now(),
        playerId: undefined as string | undefined,
        steps: [] as AuthFlowStep[]
      };
      const pendingByName = new Map<string, number>();
      let completed = false;
      return {
        setPlayerId(playerId) {
          trace.playerId = playerId;
        },
        startStep(name) {
          if (completed) return;
          pendingByName.set(name, now());
        },
        endStep(name, ok = true) {
          if (completed) return;
          const startedAt = pendingByName.get(name);
          if (startedAt === undefined) return;
          pendingByName.delete(name);
          trace.steps.push({ name, startedAt, durationMs: now() - startedAt, ok });
        },
        complete(outcome, reason) {
          if (completed) return;
          completed = true;
          for (const [name, startedAt] of pendingByName) {
            trace.steps.push({ name, startedAt, durationMs: now() - startedAt, ok: false });
          }
          pendingByName.clear();
          const totalElapsedMs = now() - trace.authReceivedAt;
          if (totalElapsedMs < thresholdMs) return;
          void post(trace, outcome, reason, totalElapsedMs);
        }
      };
    }
  };
};
