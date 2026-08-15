#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseConcurrencyLevels, computeCliffLevel, fetchMetrics, quantile } from "./lib/load-metrics.mjs";
import { closeSession, openSession, sendAction } from "./lib/load-session.mjs";

// Re-exported so the harness's public entry point stays a single module for
// callers/tests that already import these from here.
export { parseConcurrencyLevels, computeCliffLevel } from "./lib/load-metrics.mjs";
export {
  parseMuster,
  collectSettleCandidates,
  collectMusterHoldCandidates,
  collectMusterAdvanceCandidates,
  pickCandidatePayload
} from "./lib/load-candidates.mjs";

// ── Config ──────────────────────────────────────────────────────────────────
const WS_URL = process.env.WS_URL ?? "ws://127.0.0.1:3101/ws";
const CONCURRENCY_LEVELS = parseConcurrencyLevels(process.env.CONCURRENCY_LEVELS ?? "5,10,20,30,40,50,75,100");
const LEVEL_DURATION_MS = Math.max(5_000, Number(process.env.LEVEL_DURATION_MS ?? "60000"));
const ACTIONS_PER_CLIENT_PER_SEC = Math.max(0.1, Number(process.env.ACTIONS_PER_CLIENT_PER_SEC ?? "1"));
const AUTH_TOKEN_PREFIX = process.env.AUTH_TOKEN_PREFIX ?? "loadtest-";
const GATEWAY_METRICS_URL = process.env.GATEWAY_METRICS_URL ?? "http://127.0.0.1:3101/metrics";
const SIMULATION_METRICS_URL = process.env.SIMULATION_METRICS_URL ?? "http://127.0.0.1:50052/metrics";
const RESOURCE_PAUSE_MS = 2500;
const MAX_RESOURCE_PAUSES = 3;


// ── Per-client action loop (serial, resource-aware) ─────────────────────────

const ACTION_TYPES = ["EXPAND", "ATTACK", "SETTLE", "SET_MUSTER"];

const actionLoop = async (state, deadlineAt, actionIntervalMs, actionTimeoutMs) => {
  const acceptedLatenciesByType = Object.fromEntries(ACTION_TYPES.map((t) => [t, []]));
  const invalidTargets = new Set();
  const invalidOrigins = new Set();
  let resourcePauses = 0;
  let exhausted = false;

  while (Date.now() < deadlineAt && !exhausted) {
    const loopStart = Date.now();

    try {
      const result = await sendAction(state, actionTimeoutMs, invalidTargets, invalidOrigins);

      if (result.kind === "accepted" && typeof result.acceptedDelayMs === "number") {
        (acceptedLatenciesByType[result.actionType] ??= []).push(result.acceptedDelayMs);
        resourcePauses = 0;
      } else if (result.kind === "error_recoverable") {
        // Learn from recoverable rejection to avoid re-picking same candidate
        if (result.code === "NOT_OWNER") {
          invalidOrigins.add(result.originKey);
        } else {
          invalidTargets.add(result.targetKey);
        }
        resourcePauses = 0;
      } else if (result.kind === "resource_exhausted") {
        resourcePauses += 1;
        if (resourcePauses > MAX_RESOURCE_PAUSES) {
          exhausted = true;
          break;
        }
        await new Promise((r) => setTimeout(r, RESOURCE_PAUSE_MS));
        continue;
      }
    } catch (err) {
      if (process.env.DEBUG_LOAD_SCRIPT === "1") console.error("[debug] tick error:", err.message);
      // Non-recoverable error — skip this tick
    }

    // Maintain cadence: sleep for the remainder of the interval. Previously
    // guarded with `&& Date.now() + remaining < deadlineAt` to avoid an extra
    // delay right at the end of the level — but a client that runs out of
    // candidates (a real scenario once SETTLE/MUSTER pools exhaust, not just
    // a rare edge case) then has sendAction reject synchronously every call,
    // making `elapsed` ~0 forever, and that guard skips sleeping entirely
    // once inside the last actionIntervalMs of the level — spinning the
    // event loop as fast as possible for the remainder of the level (47k+
    // iterations/45s observed locally). Always sleeping is at worst a few
    // hundred ms past the nominal deadline, which is harmless.
    const elapsed = Date.now() - loopStart;
    const remaining = actionIntervalMs - elapsed;
    if (remaining > 0) {
      await new Promise((r) => setTimeout(r, remaining));
    }
  }

  return { acceptedLatenciesByType, resolvedLatencies: state.resolvedLatencies, exhausted };
};

// ── Metrics poller ──────────────────────────────────────────────────────────

const pollMetrics = (gatewayUrl, simUrl, intervalMs, stopSignal) =>
  new Promise((resolve) => {
    const samples = [];
    const timer = setInterval(async () => {
      if (stopSignal.stopped) {
        clearInterval(timer);
        resolve(samples);
        return;
      }
      try {
        const [gateway, simulation] = await Promise.all([fetchMetrics(gatewayUrl), fetchMetrics(simUrl)]);
        samples.push({ at: Date.now(), gateway, simulation });
      } catch { /* transient scrape failure */ }
    }, intervalMs);
  });

// ── Per-level runner ────────────────────────────────────────────────────────

const runLevel = async (level, durationMs, actionsPerSec) => {
  const clients = [];
  const initFailures = [];
  const actionIntervalMs = Math.max(100, Math.round(1000 / actionsPerSec));
  const actionTimeoutMs = Math.max(5_000, actionIntervalMs * 5);

  // Baseline counters so this level's delta (not the process's lifetime total)
  // is what gets reported — otherwise retries/backpressure from an earlier
  // level would inflate every subsequent level's numbers.
  const baselineMetrics = await Promise.all([
    fetchMetrics(GATEWAY_METRICS_URL).catch(() => ({})),
    fetchMetrics(SIMULATION_METRICS_URL).catch(() => ({}))
  ]);
  const baselineGatewaySqliteRetryTotal = baselineMetrics[0]["gateway_sqlite_retry_total"] ?? 0;
  const baselineSimWriterQueueBackpressureWaitTotal = baselineMetrics[1]["sim_writer_queue_backpressure_wait_total"] ?? 0;

  // Open all N clients concurrently
  const openPromises = [];
  for (let i = 0; i < level; i += 1) {
    const token = `${AUTH_TOKEN_PREFIX}${i}`;
    openPromises.push(
      openSession(WS_URL, token, 30_000).then(
        (state) => clients.push(state),
        (err) => initFailures.push({ index: i, token, message: err.message?.slice(0, 200) ?? String(err).slice(0, 200) })
      )
    );
  }
  await Promise.all(openPromises);

  // Start metrics polling
  const stopSignal = { stopped: false };
  const metricsPromise = pollMetrics(GATEWAY_METRICS_URL, SIMULATION_METRICS_URL, 1000, stopSignal);

  // Start serial action loops for each connected client
  const deadlineAt = Date.now() + durationMs;
  const loopResults = await Promise.all(
    clients.map((state) => actionLoop(state, deadlineAt, actionIntervalMs, actionTimeoutMs))
  );

  // Stop metrics polling
  stopSignal.stopped = true;
  const metricsSamples = await metricsPromise;

  // Close all clients
  await Promise.all(clients.map(closeSession));

  // Aggregate
  const latenciesByType = Object.fromEntries(
    ACTION_TYPES.map((type) => [
      type,
      loopResults.flatMap((l) => l.acceptedLatenciesByType[type] ?? []).filter((v) => Number.isFinite(v))
    ])
  );
  const allLatencies = ACTION_TYPES.flatMap((type) => latenciesByType[type]);
  const allResolvedLatencies = loopResults.flatMap((l) => l.resolvedLatencies).filter((v) => Number.isFinite(v));
  const exhaustedCount = loopResults.filter((l) => l.exhausted).length;

  // Per-action-type breakdown — the 1s SLA is evaluated per type (see
  // acceptedP99UnderSlaMsByType in computeCliffLevel), not just on the pooled
  // total, since SETTLE/SET_MUSTER could plausibly have a different cost
  // profile than EXPAND/ATTACK and pooling would hide a regression isolated
  // to one action type.
  const byActionType = Object.fromEntries(
    ACTION_TYPES.map((type) => {
      const values = latenciesByType[type];
      return [
        type,
        {
          count: values.length,
          p50Ms: quantile(values, 0.5),
          p95Ms: quantile(values, 0.95),
          p99Ms: quantile(values, 0.99),
          maxMs: values.length > 0 ? Math.max(...values) : null
        }
      ];
    })
  );

  const lastSample = metricsSamples.at(-1);
  const gatewaySqliteRetryTotalDelta = lastSample
    ? Math.max(0, (lastSample.gateway["gateway_sqlite_retry_total"] ?? 0) - baselineGatewaySqliteRetryTotal)
    : null;
  const simWriterQueueBackpressureWaitDelta = lastSample
    ? Math.max(0, (lastSample.simulation["sim_writer_queue_backpressure_wait_total"] ?? 0) - baselineSimWriterQueueBackpressureWaitTotal)
    : null;

  return {
    level,
    clientsRequested: level,
    clientsConnected: clients.length,
    initFailures: initFailures.length,
    initFailureDetails: initFailures.slice(0, 10),
    exhaustedClients: exhaustedCount,
    totalAcceptedActions: allLatencies.length,
    acceptedP50Ms: quantile(allLatencies, 0.5),
    acceptedP95Ms: quantile(allLatencies, 0.95),
    acceptedP99Ms: quantile(allLatencies, 0.99),
    acceptedMaxMs: allLatencies.length > 0 ? Math.max(...allLatencies) : null,
    byActionType,
    // Full COMBAT_RESULT/FRONTIER_RESULT round trip, sampled passively (see
    // awaitingResolution in openSession) — dominated by the game's own
    // FRONTIER_CLAIM_MS/COMBAT_LOCK_MS timers, not server latency. Reported
    // for visibility that resolution is still happening correctly under
    // load, NOT gated on — an EXPAND/ATTACK can never resolve in under 15s/
    // 30s by design, so a tight SLA here would always fail regardless of
    // server health.
    resolvedSampleCount: allResolvedLatencies.length,
    resolvedP50Ms: quantile(allResolvedLatencies, 0.5),
    resolvedP99Ms: quantile(allResolvedLatencies, 0.99),
    resolvedMaxMs: allResolvedLatencies.length > 0 ? Math.max(...allResolvedLatencies) : null,
    gatewayEventLoopMaxMs: metricsSamples.length > 0
      ? Math.max(...metricsSamples.map((s) => s.gateway["gateway_event_loop_max_ms"] ?? 0)) : null,
    simEventLoopMaxMs: metricsSamples.length > 0
      ? Math.max(...metricsSamples.map((s) => s.simulation["sim_event_loop_max_ms"] ?? 0)) : null,
    simHumanInteractiveBacklogMaxMs: metricsSamples.length > 0
      ? Math.max(...metricsSamples.map((s) => s.simulation["sim_human_interactive_backlog_ms"] ?? 0)) : null,
    simCheckpointRssMaxMb: metricsSamples.length > 0
      ? Math.max(...metricsSamples.map((s) => s.simulation["sim_checkpoint_rss_mb"] ?? 0)) : null,
    // sim_writer_queue_depth is a live gauge of in-flight SQLite writer-worker
    // messages (DEFAULT_MAX_PENDING=500 is where the sim thread starts
    // self-throttling); a level trending toward that cap is the earliest
    // signal of a persistence bottleneck, well before event-loop lag shows it.
    simWriterQueueDepthMaxDepth: metricsSamples.length > 0
      ? Math.max(...metricsSamples.map((s) => s.simulation["sim_writer_queue_depth"] ?? 0)) : null,
    simWriterQueueBackpressureWaitDelta,
    gatewaySqliteRetryTotalDelta,
    metricsSampleCount: metricsSamples.length
  };
};

// ── Main ────────────────────────────────────────────────────────────────────

const isMain = import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dateStamp = new Date().toISOString().slice(0, 10);
const outputPath = resolve(root, "docs", "load-results", `concurrent-${dateStamp}.json`);

const thresholds = {
  acceptedP99Ms: 250,
  gatewayEventLoopMaxMs: 1000,
  simEventLoopMaxMs: 1000,
  // DEFAULT_MAX_PENDING in SqliteWriterChannel (apps/simulation) is 500 — the
  // point where the sim thread starts self-throttling writes. Gate at 400 so
  // a queue trending toward saturation trips the cliff before backpressure
  // (and the command-acceptance latency it causes) actually engages.
  simWriterQueueDepthMaxDepth: 400,
  // "Never above 1s, for any of the four action types" SLA. This is the
  // acceptance ack (ACTION_ACCEPTED/COMMAND_QUEUED), never the full
  // FRONTIER_RESULT/COMBAT_RESULT resolution — see resolvedP99Ms's comment
  // in runLevel for why a 1s SLA against resolution would be meaningless.
  acceptedMaxMsByType: Math.max(1, Number(process.env.ACCEPTED_MAX_MS_SLA ?? "1000"))
};

const levelRecords = [];

for (const level of CONCURRENCY_LEVELS) {
  console.log(`[level] starting N=${level} clients, duration=${LEVEL_DURATION_MS}ms...`);
  const record = await runLevel(level, LEVEL_DURATION_MS, ACTIONS_PER_CLIENT_PER_SEC);
  levelRecords.push(record);
  console.log(`[level] N=${level} connected=${record.clientsConnected} failed=${record.initFailures} ` +
    `exhausted=${record.exhaustedClients} actions=${record.totalAcceptedActions} ` +
    `p99=${record.acceptedP99Ms}ms resolvedP99=${record.resolvedP99Ms}ms ` +
    `gwLoop=${record.gatewayEventLoopMaxMs}ms simLoop=${record.simEventLoopMaxMs}ms ` +
    `writerQueue=${record.simWriterQueueDepthMaxDepth} sqliteRetries=${record.gatewaySqliteRetryTotalDelta}`);
  for (const [type, stats] of Object.entries(record.byActionType)) {
    if (stats.count === 0) continue;
    console.log(`  [${type}] n=${stats.count} p50=${stats.p50Ms}ms p99=${stats.p99Ms}ms max=${stats.maxMs}ms`);
  }
}

const cliffLevel = computeCliffLevel(levelRecords, thresholds);

const payload = {
  at: new Date().toISOString(),
  config: {
    wsUrl: WS_URL,
    concurrencyLevels: CONCURRENCY_LEVELS,
    levelDurationMs: LEVEL_DURATION_MS,
    actionsPerClientPerSec: ACTIONS_PER_CLIENT_PER_SEC,
    authTokenPrefix: AUTH_TOKEN_PREFIX,
    gatewayMetricsUrl: GATEWAY_METRICS_URL,
    simulationMetricsUrl: SIMULATION_METRICS_URL
  },
  thresholds,
  cliffLevel,
  levels: levelRecords
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
console.log(outputPath);

if (cliffLevel !== null) {
  console.log(`[cliff] found at N=${cliffLevel}`);
} else {
  console.log(`[cliff] no cliff found up to max level ${CONCURRENCY_LEVELS[CONCURRENCY_LEVELS.length - 1]}`);
}
}
