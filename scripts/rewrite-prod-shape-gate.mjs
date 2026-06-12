#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const numberEnv = (name, fallback) => {
  if (!(name in process.env)) return fallback;
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
};

const captureGitSha = () => {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8"
  });
  if (result.status !== 0) return null;
  return result.stdout.trim();
};

const boolEnv = (name, fallback = false) => {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return value === "1" || value.toLowerCase() === "true";
};

const quantileLabel = (metric, quantile) => `${metric}{quantile="${quantile}"}`;

const metricKey = (name, labels = {}) => {
  const entries = Object.entries(labels).filter(([, value]) => value !== undefined);
  if (entries.length === 0) return name;
  return `${name}{${entries.map(([key, value]) => `${key}="${value}"`).join(",")}}`;
};

const parsePrometheus = (text) => {
  const metrics = new Map();
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([^{\s]+)(?:\{([^}]*)\})?\s+(-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)$/i);
    if (!match) continue;
    const [, name, rawLabels, rawValue] = match;
    const labels = {};
    if (rawLabels) {
      for (const part of rawLabels.split(",")) {
        const labelMatch = part.match(/^([^=]+)="(.*)"$/);
        if (!labelMatch) continue;
        labels[labelMatch[1]] = labelMatch[2];
      }
    }
    metrics.set(metricKey(name, labels), Number(rawValue));
  }
  return metrics;
};

const getMetric = (metrics, name, labels = {}) => metrics.get(metricKey(name, labels)) ?? null;

const fetchText = async (url, timeoutMs) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { accept: "text/plain, application/json" } });
    if (!response.ok) throw new Error(`${url} returned ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
};

const runNodeScript = async (script, env, timeoutMs) =>
  new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [resolve(root, "scripts", script)], {
      cwd: root,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"]
    });
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      rejectPromise(new Error(`${script} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    const stdout = [];
    const stderr = [];
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timeout);
      rejectPromise(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      const out = stdout.join("");
      const err = stderr.join("");
      if (code !== 0) {
        rejectPromise(new Error(`${script} exited ${code}: ${err || out}`));
        return;
      }
      resolvePromise({ stdout: out, stderr: err });
    });
  });

const parseLastJsonObject = (text, predicate) => {
  const lines = text.split(/\r?\n/).filter(Boolean);
  for (const line of [...lines].reverse()) {
    try {
      const parsed = JSON.parse(line);
      if (!predicate || predicate(parsed)) return parsed;
    } catch {
      // Ignore non-JSON logging from child scripts.
    }
  }
  return undefined;
};

const summarizeMetrics = (gatewayMetrics, simulationMetrics) => ({
  gatewayEventLoopP99Ms: getMetric(gatewayMetrics, "gateway_event_loop_delay_ms", { quantile: "p99" }),
  gatewayCommandSubmitP99Ms: getMetric(gatewayMetrics, "gateway_command_submit_latency_ms", { quantile: "p99" }),
  gatewaySimRpcP99Ms: getMetric(gatewayMetrics, "gateway_sim_rpc_latency_ms", { quantile: "p99" }),
  gatewaySnapshotJsonP99Bytes: getMetric(gatewayMetrics, "gateway_snapshot_json_bytes", { quantile: "p99" }),
  simEventLoopP99Ms: getMetric(simulationMetrics, "sim_event_loop_delay_ms", { quantile: "p99" }),
  simAiTickP99Ms: getMetric(simulationMetrics, "sim_tick_duration_ms", { source: "ai", quantile: "p99" }),
  simRequestPlanRoundTripP99Ms: getMetric(simulationMetrics, "sim_ai_planner_phase_ms", {
    phase: "request_plan_round_trip",
    quantile: "p99"
  }),
  simPlannerTotalP99Ms: getMetric(simulationMetrics, "sim_ai_planner_phase_ms", { phase: "planner_total", quantile: "p99" }),
  simSyncPlayersTotalP99Ms: getMetric(simulationMetrics, "sim_ai_planner_phase_ms", {
    phase: "sync_players_total",
    quantile: "p99"
  }),
  simRuntimeDrainAiP99Ms: getMetric(simulationMetrics, "sim_runtime_drain_ms_by_lane", { lane: "ai", quantile: "p99" }),
  simHumanInteractiveAcceptP99Ms: getMetric(simulationMetrics, "sim_command_accept_latency_ms", {
    lane: "human_interactive",
    quantile: "p99"
  }),
  simHeapUsedMb: getMetric(simulationMetrics, "sim_heap_used_mb"),
  simGcPauseP99Ms: getMetric(simulationMetrics, "sim_gc_pause_ms", { quantile: "p99" })
});

const absoluteThresholds = {
  acceptedP95Ms: numberEnv("PROD_SHAPE_ACCEPTED_P95_MAX_MS", 250),
  acceptedP99Ms: numberEnv("PROD_SHAPE_ACCEPTED_P99_MAX_MS", 750),
  gatewayEventLoopP99Ms: numberEnv("PROD_SHAPE_GATEWAY_EVENT_LOOP_P99_MAX_MS", 1500),
  simAiTickP99Ms: numberEnv("PROD_SHAPE_SIM_AI_TICK_P99_MAX_MS", 5000),
  simRequestPlanRoundTripP99Ms: numberEnv("PROD_SHAPE_PLAN_ROUND_TRIP_P99_MAX_MS", 5000),
  simRuntimeDrainAiP99Ms: numberEnv("PROD_SHAPE_AI_DRAIN_P99_MAX_MS", 1500)
};

const regressionRatio = numberEnv("PROD_SHAPE_REGRESSION_RATIO", 1.5);
const regressionFloorMs = numberEnv("PROD_SHAPE_REGRESSION_FLOOR_MS", 50);

const compareMetric = (name, value, threshold) => ({
  name,
  value,
  threshold,
  ok: typeof value === "number" && value <= threshold
});

const compareRegression = (name, value, baselineValue) => {
  if (typeof value !== "number" || typeof baselineValue !== "number") {
    return { name, value, baselineValue, threshold: null, ok: true, skipped: true };
  }
  const threshold = Math.max(baselineValue + regressionFloorMs, baselineValue * regressionRatio);
  return { name, value, baselineValue, threshold, ok: value <= threshold };
};

const wsUrl = process.env.WS_URL ?? "ws://127.0.0.1:3101/ws";
const authToken = process.env.AUTH_TOKEN ?? "player-1";
const gatewayHealthUrl = process.env.GATEWAY_HEALTH_URL ?? "http://127.0.0.1:3101/health";
const gatewayMetricsUrl = process.env.GATEWAY_METRICS_URL ?? "http://127.0.0.1:3101/metrics";
const simulationMetricsUrl = process.env.SIMULATION_METRICS_URL ?? "http://127.0.0.1:50052/metrics";
const outputPath = resolve(root, process.env.PROD_SHAPE_OUTPUT_PATH ?? `docs/load-results/prod-shape-${Date.now()}.json`);
const baselinePath = process.env.PROD_SHAPE_BASELINE_JSON;
const timeoutMs = numberEnv("PROD_SHAPE_TIMEOUT_MS", 15000);
const soakIterations = Math.max(1, numberEnv("PROD_SHAPE_SOAK_ITERATIONS", 30));
const warmupIterations = Math.max(0, numberEnv("PROD_SHAPE_WARMUP_ITERATIONS", 2));
const waitForResult = boolEnv("PROD_SHAPE_WAIT_FOR_RESULT", false);
const allowAttacks = boolEnv("PROD_SHAPE_ALLOW_ATTACKS", false);
const allowLiveProdMutation = boolEnv("PROD_SHAPE_ALLOW_LIVE_PROD_MUTATION", false);
const targetGitSha = process.env.PROD_SHAPE_TARGET_SHA ?? captureGitSha();

if (/^wss:\/\/border-empires-combined\.fly\.dev\/ws/.test(wsUrl) && !allowLiveProdMutation) {
  throw new Error(
    "Refusing to run frontier mutations against live production. Clone the prod snapshot into an isolated DB, or set PROD_SHAPE_ALLOW_LIVE_PROD_MUTATION=1 deliberately."
  );
}

const startedAt = new Date();
const healthText = await fetchText(gatewayHealthUrl, timeoutMs);
const beforeGatewayMetrics = parsePrometheus(await fetchText(gatewayMetricsUrl, timeoutMs));
const beforeSimulationMetrics = parsePrometheus(await fetchText(simulationMetricsUrl, timeoutMs));

const loginSmoke = await runNodeScript(
  "rewrite-live-smoke.mjs",
  {
    WS_URL: wsUrl,
    AUTH_TOKEN: authToken,
    SMOKE_TIMEOUT_MS: String(timeoutMs)
  },
  timeoutMs + 2000
);
const loginSummary = parseLastJsonObject(loginSmoke.stdout, (entry) => Object.prototype.hasOwnProperty.call(entry, "ok"));
if (!loginSummary?.ok) throw new Error(`login smoke failed: ${loginSmoke.stdout || loginSmoke.stderr}`);

const frontierSmokeMaxAttempts = 3;
let frontierSummary;
for (let attempt = 1; attempt <= frontierSmokeMaxAttempts; attempt++) {
  const frontierSmoke = await runNodeScript(
    "rewrite-live-smoke.mjs",
    {
      WS_URL: wsUrl,
      AUTH_TOKEN: authToken,
      ACTION_TYPE: "EXPAND",
      SMOKE_TIMEOUT_MS: String(timeoutMs)
    },
    timeoutMs + 2000
  );
  frontierSummary = parseLastJsonObject(frontierSmoke.stdout, (entry) => Object.prototype.hasOwnProperty.call(entry, "ok"));
  if (frontierSummary?.ok) break;
  if (attempt < frontierSmokeMaxAttempts) {
    console.error(`frontier smoke attempt ${attempt} failed, retrying in 2s: ${frontierSmoke.stdout || frontierSmoke.stderr}`);
    await new Promise((r) => setTimeout(r, 2000));
  } else {
    throw new Error(`frontier smoke failed after ${frontierSmokeMaxAttempts} attempts: ${frontierSmoke.stdout || frontierSmoke.stderr}`);
  }
}

const soak = await runNodeScript(
  "rewrite-local-soak.mjs",
  {
    WS_URL: wsUrl,
    AUTH_TOKEN: authToken,
    SOAK_ITERATIONS: String(soakIterations),
    SOAK_WARMUP_ITERATIONS: String(warmupIterations),
    SOAK_TIMEOUT_MS: String(timeoutMs),
    SOAK_WAIT_FOR_RESULT: waitForResult ? "1" : "0",
    SOAK_ALLOW_ATTACKS: allowAttacks ? "1" : "0",
    SOAK_LOG_EACH_ITERATION: "0",
    SOAK_EMIT_LATENCIES: "1"
  },
  (soakIterations + warmupIterations) * timeoutMs + 10000
);
const soakSummary = parseLastJsonObject(soak.stdout, (entry) => entry?.ok === true && typeof entry.iterations === "number");
if (!soakSummary) throw new Error(`soak did not emit a summary: ${soak.stdout || soak.stderr}`);

const afterGatewayMetrics = parsePrometheus(await fetchText(gatewayMetricsUrl, timeoutMs));
const afterSimulationMetrics = parsePrometheus(await fetchText(simulationMetricsUrl, timeoutMs));
const metrics = summarizeMetrics(afterGatewayMetrics, afterSimulationMetrics);

const absoluteChecks = [
  compareMetric("acceptedP95Ms", soakSummary.acceptedP95Ms, absoluteThresholds.acceptedP95Ms),
  compareMetric("acceptedP99Ms", soakSummary.acceptedP99Ms, absoluteThresholds.acceptedP99Ms),
  compareMetric("gatewayEventLoopP99Ms", metrics.gatewayEventLoopP99Ms, absoluteThresholds.gatewayEventLoopP99Ms),
  compareMetric("simAiTickP99Ms", metrics.simAiTickP99Ms, absoluteThresholds.simAiTickP99Ms),
  compareMetric("simRequestPlanRoundTripP99Ms", metrics.simRequestPlanRoundTripP99Ms, absoluteThresholds.simRequestPlanRoundTripP99Ms),
  compareMetric("simRuntimeDrainAiP99Ms", metrics.simRuntimeDrainAiP99Ms, absoluteThresholds.simRuntimeDrainAiP99Ms)
];

let baseline;
if (baselinePath) {
  baseline = JSON.parse(await readFile(resolve(root, baselinePath), "utf8"));
}
const baselineMetrics = baseline?.metrics ?? {};
const baselineSoak = baseline?.soak ?? {};
const regressionChecks = baseline
  ? [
      compareRegression("acceptedP95Ms", soakSummary.acceptedP95Ms, baselineSoak.acceptedP95Ms),
      compareRegression("acceptedP99Ms", soakSummary.acceptedP99Ms, baselineSoak.acceptedP99Ms),
      compareRegression("gatewayEventLoopP99Ms", metrics.gatewayEventLoopP99Ms, baselineMetrics.gatewayEventLoopP99Ms),
      compareRegression("simAiTickP99Ms", metrics.simAiTickP99Ms, baselineMetrics.simAiTickP99Ms),
      compareRegression("simRequestPlanRoundTripP99Ms", metrics.simRequestPlanRoundTripP99Ms, baselineMetrics.simRequestPlanRoundTripP99Ms),
      compareRegression("simRuntimeDrainAiP99Ms", metrics.simRuntimeDrainAiP99Ms, baselineMetrics.simRuntimeDrainAiP99Ms)
    ]
  : [];

const payload = {
  ok: absoluteChecks.every((check) => check.ok) && regressionChecks.every((check) => check.ok),
  at: startedAt.toISOString(),
  target: {
    gitSha: targetGitSha,
    wsUrl,
    gatewayHealthUrl,
    gatewayMetricsUrl,
    simulationMetricsUrl
  },
  health: (() => {
    try {
      return JSON.parse(healthText);
    } catch {
      return healthText;
    }
  })(),
  smokes: {
    login: loginSummary,
    frontier: frontierSummary
  },
  soak: soakSummary,
  metrics,
  beforeMetrics: summarizeMetrics(beforeGatewayMetrics, beforeSimulationMetrics),
  gates: {
    absolute: absoluteChecks,
    regression: regressionChecks,
    regressionRatio,
    regressionFloorMs
  }
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ ok: payload.ok, outputPath, failed: [...absoluteChecks, ...regressionChecks].filter((check) => !check.ok) }, null, 2));

if (!payload.ok) process.exit(2);
