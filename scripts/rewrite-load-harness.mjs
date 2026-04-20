#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const quantile = (values, q) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * q) - 1));
  return sorted[index] ?? null;
};

const parsePrometheus = (text) => {
  const metrics = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const parts = line.trim().split(/\s+/);
    if (parts.length < 2) continue;
    const key = parts[0];
    const value = Number(parts[1]);
    if (!Number.isFinite(value)) continue;
    metrics[key] = value;
  }
  return metrics;
};

const fetchMetrics = async (url) => {
  const response = await fetch(url, { headers: { accept: "text/plain" } });
  if (!response.ok) throw new Error(`failed to fetch ${url}: ${response.status}`);
  return parsePrometheus(await response.text());
};

const runSoakBatch = async ({ cwd, wsUrl, iterations, timeoutMs }) => {
  const soakScript = resolve(cwd, "scripts", "rewrite-local-soak.mjs");
  const env = {
    ...process.env,
    WS_URL: wsUrl,
    SOAK_ITERATIONS: String(iterations),
    SOAK_WARMUP_ITERATIONS: "1",
    SOAK_TIMEOUT_MS: String(timeoutMs),
    SOAK_LOG_EACH_ITERATION: "0",
    SOAK_EMIT_LATENCIES: "1",
    SOAK_WAIT_FOR_RESULT: "0"
  };

  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [soakScript], { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    const lines = [];
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      lines.push(...chunk.split(/\r?\n/).filter(Boolean));
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    child.on("error", rejectPromise);
    child.on("close", (code) => {
      if (code !== 0) {
        rejectPromise(new Error(`rewrite-local-soak exited ${code}: ${stderr || "no stderr"}`));
        return;
      }
      const jsonLines = lines
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return undefined;
          }
        })
        .filter(Boolean);
      const summary = [...jsonLines].reverse().find((entry) => entry && entry.ok === true && typeof entry.iterations === "number");
      if (!summary) {
        rejectPromise(new Error("rewrite-local-soak did not emit a summary object"));
        return;
      }
      resolvePromise(summary);
    });
  });
};

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const now = new Date();
const dateStamp = now.toISOString().slice(0, 10);
const outputPath = resolve(root, "docs", "load-results", `${dateStamp}.json`);

const gatewayMetricsUrl = process.env.GATEWAY_METRICS_URL ?? "http://127.0.0.1:3101/metrics";
const simulationMetricsUrl = process.env.SIMULATION_METRICS_URL ?? "http://127.0.0.1:50052/metrics";
const wsUrl = process.env.WS_URL ?? "ws://127.0.0.1:3101/ws";
const soakMinutes = Math.max(1, Number(process.env.LOAD_HARNESS_SOAK_MINUTES ?? "30"));
const pollIntervalMs = Math.max(250, Number(process.env.LOAD_HARNESS_POLL_MS ?? "1000"));
const soakBatchIterations = Math.max(10, Number(process.env.LOAD_HARNESS_BATCH_ITERATIONS ?? "120"));
const soakTimeoutMs = Math.max(3_000, Number(process.env.LOAD_HARNESS_SOAK_TIMEOUT_MS ?? "15000"));

const startedAt = Date.now();
const deadlineAt = startedAt + soakMinutes * 60_000;

const metricsSamples = [];
let monitorTimer;

const collectMetricsSample = async () => {
  const [gateway, simulation] = await Promise.all([fetchMetrics(gatewayMetricsUrl), fetchMetrics(simulationMetricsUrl)]);
  metricsSamples.push({ at: Date.now(), gateway, simulation });
};

await collectMetricsSample();
monitorTimer = setInterval(() => {
  void collectMetricsSample().catch(() => {
    // transient metrics scrape failures are captured in final checks
  });
}, pollIntervalMs);

const soakBatches = [];
const acceptedLatenciesMs = [];

try {
  while (Date.now() < deadlineAt) {
    const summary = await runSoakBatch({
      cwd: root,
      wsUrl,
      iterations: soakBatchIterations,
      timeoutMs: soakTimeoutMs
    });
    soakBatches.push({
      at: Date.now(),
      iterations: summary.iterations,
      acceptedSamples: summary.acceptedSamples,
      acceptedP95Ms: summary.acceptedP95Ms,
      acceptedP99Ms: summary.acceptedP99Ms,
      acceptedMaxMs: summary.acceptedMaxMs
    });
    if (Array.isArray(summary.acceptedLatenciesMs)) {
      for (const latency of summary.acceptedLatenciesMs) {
        if (Number.isFinite(latency)) acceptedLatenciesMs.push(latency);
      }
    }
  }
} finally {
  clearInterval(monitorTimer);
}

await collectMetricsSample();

const acceptedP95Ms = quantile(acceptedLatenciesMs, 0.95);
const acceptedP99Ms = quantile(acceptedLatenciesMs, 0.99);
const acceptedMaxMs = acceptedLatenciesMs.length > 0 ? Math.max(...acceptedLatenciesMs) : null;

const gatewayEventLoopMaxMs = metricsSamples.length > 0
  ? Math.max(...metricsSamples.map((sample) => sample.gateway["gateway_event_loop_max_ms"] ?? 0))
  : null;
const simEventLoopMaxMs = metricsSamples.length > 0
  ? Math.max(...metricsSamples.map((sample) => sample.simulation["sim_event_loop_max_ms"] ?? 0))
  : null;

const gates = {
  actionAcceptedP95Under100: typeof acceptedP95Ms === "number" && acceptedP95Ms < 100,
  actionAcceptedP99Under250: typeof acceptedP99Ms === "number" && acceptedP99Ms < 250,
  actionAcceptedMaxUnder500: typeof acceptedMaxMs === "number" && acceptedMaxMs < 500,
  gatewayEventLoopMaxUnder50: typeof gatewayEventLoopMaxMs === "number" && gatewayEventLoopMaxMs < 50,
  simEventLoopMaxUnder100: typeof simEventLoopMaxMs === "number" && simEventLoopMaxMs < 100
};

const payload = {
  at: now.toISOString(),
  soak: {
    wsUrl,
    startedAt: new Date(startedAt).toISOString(),
    endedAt: new Date().toISOString(),
    soakMinutes,
    acceptedSamples: acceptedLatenciesMs.length,
    acceptedP95Ms,
    acceptedP99Ms,
    acceptedMaxMs,
    batches: soakBatches
  },
  metrics: {
    gatewayMetricsUrl,
    simulationMetricsUrl,
    sampleCount: metricsSamples.length,
    gatewayEventLoopMaxMs,
    simEventLoopMaxMs
  },
  gates,
  allGatesGreen: Object.values(gates).every(Boolean)
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(outputPath);

if (!payload.allGatesGreen) {
  console.error(JSON.stringify({ ok: false, gates }, null, 2));
  process.exit(2);
}
