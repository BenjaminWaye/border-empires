#!/usr/bin/env node
// Phase 0 of docs/plans/2026-08-22-beta-lobby-synchronized-season-start.md:
// prove N clients can connect and JOIN_SEASON concurrently before building a
// synchronized-start lobby that deliberately manufactures that thundering
// herd. Sibling to rewrite-load-harness.mjs (which drives sequential
// EXPAND/ATTACK batches from one authenticated session) rather than a mode on
// it, since the two scripts share almost nothing besides the metrics helper.
//
// Opens N websockets, authenticates each with a distinct dev token (see
// resolveGatewayAuthIdentity's allowDirectPlayerIdToken path -- the same
// mechanism rewrite-local-soak.mjs relies on for AUTH_TOKEN), waits for every
// socket's INIT, then fires JOIN_SEASON on all of them inside a narrow
// window and measures the JOIN_SEASON_ACK/ERROR latency distribution plus
// gateway/simulation event-loop health during the burst.
import WebSocket from "ws";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";
import { parsePrometheus } from "./rewrite-load-harness-metrics.mjs";

const wsUrl = process.env.WS_URL ?? "ws://127.0.0.1:3101/ws";
const gatewayMetricsUrl = process.env.GATEWAY_METRICS_URL ?? "http://127.0.0.1:3101/metrics";
const simulationMetricsUrl = process.env.SIMULATION_METRICS_URL ?? "http://127.0.0.1:50052/metrics";
// Default 25: quick to run locally. The plan calls for running this at
// 25 / 50 / 100 / 150 before committing to a real beta launch time.
const concurrentClients = Math.max(1, Number(process.env.CONCURRENT_JOIN_CLIENTS ?? "25"));
const tokenPrefix = process.env.CONCURRENT_JOIN_TOKEN_PREFIX ?? "load-join";
const authTimeoutMs = Math.max(1_000, Number(process.env.CONCURRENT_JOIN_AUTH_TIMEOUT_MS ?? "15000"));
const joinTimeoutMs = Math.max(1_000, Number(process.env.CONCURRENT_JOIN_TIMEOUT_MS ?? "15000"));

const percentile = (values, fraction) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index];
};

const fetchMetrics = async (url) => {
  try {
    const response = await fetch(url, { headers: { accept: "text/plain" } });
    if (!response.ok) return { ok: false, error: `${response.status}` };
    return { ok: true, metrics: parsePrometheus(await response.text()) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
};

// Opens one socket and resolves once AUTH has completed (first INIT
// received). Does not send JOIN_SEASON yet -- that happens for every open
// session together, in the same tight loop, to manufacture the burst.
const openAuthenticatedSession = (token) =>
  new Promise((resolvePromise, rejectPromise) => {
    const openedAt = Date.now();
    const socket = new WebSocket(wsUrl);
    let settled = false;
    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        socket.close();
      } catch {
        // Ignore close races during the auth timeout.
      }
      rejectPromise(new Error(`token ${token} timed out waiting for INIT after ${Date.now() - openedAt}ms`));
    }, authTimeoutMs);

    socket.on("open", () => {
      socket.send(JSON.stringify({ type: "AUTH", token }));
    });

    socket.on("message", (data) => {
      if (settled) return;
      let message;
      try {
        message = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (message.type === "INIT") {
        settled = true;
        clearTimeout(timeoutId);
        const playerId = typeof message.player?.id === "string" ? message.player.id : token;
        resolvePromise({ token, playerId, socket, authenticatedAt: Date.now(), authLatencyMs: Date.now() - openedAt });
        return;
      }
      if (message.type === "ERROR") {
        settled = true;
        clearTimeout(timeoutId);
        try {
          socket.close();
        } catch {
          // Ignore close races.
        }
        rejectPromise(new Error(`token ${token} auth rejected: ${message.code ?? "UNKNOWN"} ${message.message ?? ""}`));
      }
    });

    socket.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      rejectPromise(error);
    });
  });

// Fires JOIN_SEASON on an already-authenticated session and resolves once
// JOIN_SEASON_ACK or a terminal ERROR arrives, recording the round-trip
// latency from the moment this call sent the message (not from when the
// socket opened) -- that's the number that matters for "can the join path
// take a thundering herd", independent of connection setup time.
const fireJoinSeason = (session) =>
  new Promise((resolvePromise) => {
    const { socket, playerId, token } = session;
    const sentAt = Date.now();
    let settled = false;
    let timeoutId;

    const settle = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      socket.off("message", onMessage);
      resolvePromise(result);
    };

    const onMessage = (data) => {
      let message;
      try {
        message = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (message.type === "JOIN_SEASON_ACK") {
        settle({ token, playerId, ok: true, latencyMs: Date.now() - sentAt, spawned: message.spawned === true });
        return;
      }
      if (message.type === "ERROR" && (message.code === "SEASON_FULL" || message.code === "SEASON_PENDING" || message.code === "JOIN_SEASON_FAILED")) {
        settle({ token, playerId, ok: message.code !== "JOIN_SEASON_FAILED", code: message.code, latencyMs: Date.now() - sentAt });
      }
    };

    socket.on("message", onMessage);
    timeoutId = setTimeout(() => settle({ token, playerId, ok: false, code: "TIMEOUT", latencyMs: Date.now() - sentAt }), joinTimeoutMs);
    socket.send(JSON.stringify({ type: "JOIN_SEASON" }));
  });

const closeAll = (sessions) => {
  for (const session of sessions) {
    try {
      session.socket.close();
    } catch {
      // Ignore close races during teardown.
    }
  }
};

console.log(`opening ${concurrentClients} concurrent websockets against ${wsUrl}...`);
const authResults = await Promise.allSettled(
  Array.from({ length: concurrentClients }, (_unused, i) => openAuthenticatedSession(`${tokenPrefix}-${i}`))
);

const sessions = authResults.filter((r) => r.status === "fulfilled").map((r) => r.value);
const authFailures = authResults
  .filter((r) => r.status === "rejected")
  .map((r) => (r.reason instanceof Error ? r.reason.message : String(r.reason)));

console.log(`authenticated ${sessions.length}/${concurrentClients} sessions (${authFailures.length} auth failures). Firing JOIN_SEASON burst...`);

const preBurstMetrics = await Promise.all([fetchMetrics(gatewayMetricsUrl), fetchMetrics(simulationMetricsUrl)]);

const burstStartedAt = Date.now();
const joinResults = await Promise.all(sessions.map((session) => fireJoinSeason(session)));
const burstDurationMs = Date.now() - burstStartedAt;

const postBurstMetrics = await Promise.all([fetchMetrics(gatewayMetricsUrl), fetchMetrics(simulationMetricsUrl)]);

closeAll(sessions);

const joinLatenciesMs = joinResults.filter((r) => r.ok).map((r) => r.latencyMs);
const joinFailures = joinResults.filter((r) => !r.ok);

const gatewayEventLoopMaxMs = postBurstMetrics[0].ok ? postBurstMetrics[0].metrics["gateway_event_loop_max_ms"] ?? null : null;
const simEventLoopMaxMs = postBurstMetrics[1].ok ? postBurstMetrics[1].metrics["sim_event_loop_max_ms"] ?? null : null;

const gates = {
  authSuccessRateAtLeast95Pct: sessions.length >= concurrentClients * 0.95,
  joinSuccessRateAtLeast95Pct: sessions.length > 0 && joinResults.filter((r) => r.ok).length >= sessions.length * 0.95,
  joinAcceptedP95Under1000: percentile(joinLatenciesMs, 0.95) === null || percentile(joinLatenciesMs, 0.95) < 1000,
  gatewayEventLoopMaxUnder500: typeof gatewayEventLoopMaxMs !== "number" || gatewayEventLoopMaxMs < 500,
  simEventLoopMaxUnder150: typeof simEventLoopMaxMs !== "number" || simEventLoopMaxMs < 150
};

const payload = {
  at: new Date(burstStartedAt).toISOString(),
  wsUrl,
  concurrentClients,
  sessionsAuthenticated: sessions.length,
  authFailures,
  burstDurationMs,
  join: {
    successCount: joinResults.filter((r) => r.ok).length,
    failureCount: joinFailures.length,
    failures: joinFailures.slice(0, 20),
    latencyP50Ms: percentile(joinLatenciesMs, 0.5),
    latencyP95Ms: percentile(joinLatenciesMs, 0.95),
    latencyP99Ms: percentile(joinLatenciesMs, 0.99),
    latencyMaxMs: joinLatenciesMs.length > 0 ? Math.max(...joinLatenciesMs) : null
  },
  metrics: {
    preBurst: { gateway: preBurstMetrics[0], simulation: preBurstMetrics[1] },
    postBurst: { gateway: postBurstMetrics[0], simulation: postBurstMetrics[1] },
    gatewayEventLoopMaxMs,
    simEventLoopMaxMs
  },
  gates,
  allGatesGreen: Object.values(gates).every(Boolean)
};

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(root, "docs", "load-results", `concurrent-join-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(outputPath);
console.log(JSON.stringify({ gates, allGatesGreen: payload.allGatesGreen }, null, 2));

if (!payload.allGatesGreen) process.exit(2);
