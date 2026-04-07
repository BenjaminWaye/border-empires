import { spawn } from "node:child_process";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

const cwd = process.cwd();
const port = Number(process.env.AI_BENCH_PORT ?? 3210);
const durationSec = Number(process.env.AI_BENCH_DURATION_SEC ?? 25);
const aiPlayers = Number(process.env.AI_BENCH_PLAYERS ?? 100);
const serverUrl = `http://127.0.0.1:${port}`;
const startedAt = Date.now();

const serverEnv = {
  ...process.env,
  NODE_OPTIONS: process.env.NODE_OPTIONS ?? "--max-old-space-size=256",
  PORT: String(port),
  AI_PLAYERS: String(aiPlayers),
  AI_BRAIN_MODE: process.env.AI_BRAIN_MODE ?? "behavior_tree_utility",
  AI_PLANNER_WORKER: process.env.AI_PLANNER_WORKER ?? "0",
  AI_TICK_BATCH_SIZE: process.env.AI_TICK_BATCH_SIZE ?? "12",
  AI_TICK_MS: process.env.AI_TICK_MS ?? "3000",
  AI_DISPATCH_INTERVAL_MS: process.env.AI_DISPATCH_INTERVAL_MS ?? "250",
  AI_TICK_BUDGET_MS: process.env.AI_TICK_BUDGET_MS ?? "1000",
  CHUNK_SERIALIZER_WORKER: process.env.CHUNK_SERIALIZER_WORKER ?? "0",
  CHUNK_READ_WORKER: process.env.CHUNK_READ_WORKER ?? "0",
  SIM_COMBAT_WORKER: process.env.SIM_COMBAT_WORKER ?? "0"
};

const server = spawn("node", ["packages/server/dist/main.js"], {
  cwd,
  env: serverEnv,
  stdio: ["ignore", "pipe", "pipe"]
});

let stdout = "";
let stderr = "";
server.stdout.on("data", (chunk) => {
  stdout += chunk.toString();
});
server.stderr.on("data", (chunk) => {
  stderr += chunk.toString();
});

const stopServer = async () => {
  if (server.killed) return;
  server.kill("SIGTERM");
  await delay(500);
  if (!server.killed) server.kill("SIGKILL");
};

const fetchJson = async (path) => {
  const res = await fetch(`${serverUrl}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path} returned ${res.status}`);
  return res.json();
};

try {
  let runtime;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      runtime = await fetchJson("/admin/runtime/debug");
      break;
    } catch {
      await delay(1000);
    }
  }

  if (!runtime) throw new Error("server did not become ready");

  const runtimeSamples = [];
  const aiDebugSamples = [];
  const deadline = Date.now() + durationSec * 1000;
  while (Date.now() < deadline) {
    runtimeSamples.push(await fetchJson("/admin/runtime/debug"));
    aiDebugSamples.push(await fetchJson("/admin/ai/debug"));
    await delay(2000);
  }

  const latestRuntime = runtimeSamples.at(-1);
  const latestAiDebug = aiDebugSamples.at(-1);
  const activeSamples = runtimeSamples.filter((sample) => sample.aiScheduler.totalAiPlayers > 0 || sample.history.aiTicks.length > 0);
  const samplesForAssertions = activeSamples.length > 0 ? activeSamples : runtimeSamples;
  const maxRssMb = Math.max(...runtimeSamples.map((sample) => sample.runtime.rssMb));
  const maxHeapUsedMb = Math.max(...runtimeSamples.map((sample) => sample.runtime.heapUsedMb));
  const maxAiTickP95Ms = Math.max(...runtimeSamples.map((sample) => sample.hotspots.aiTicks.p95Ms));
  const maxAiTickMaxMs = Math.max(...runtimeSamples.map((sample) => sample.hotspots.aiTicks.maxMs));
  const budgetBreaches = Math.max(...runtimeSamples.map((sample) => sample.aiBudget.breaches));
  const minAiPlayers = Math.min(...samplesForAssertions.map((sample) => sample.counts.aiPlayers));
  const minScheduledAi = Math.min(...samplesForAssertions.map((sample) => sample.aiScheduler.totalAiPlayers));
  const maxScheduledAi = Math.max(...samplesForAssertions.map((sample) => sample.aiScheduler.totalAiPlayers));
  const maxSimulationQueueDepth = Math.max(...runtimeSamples.map((sample) => sample.queuePressure.aiSimulationQueueDepth));

  const result = {
    ok:
      minAiPlayers >= aiPlayers &&
      maxScheduledAi >= aiPlayers &&
      budgetBreaches === 0 &&
      maxRssMb <= 512,
    durationSec,
    brainMode: latestRuntime.aiBrain.mode,
    nodeOptions: serverEnv.NODE_OPTIONS,
    aiPlayersConfigured: aiPlayers,
    aiPlayersObserved: latestRuntime.counts.aiPlayers,
    scheduledAiObserved: latestRuntime.aiScheduler.totalAiPlayers,
    minAiPlayers,
    minScheduledAi,
    maxScheduledAi,
    maxRssMb,
    maxHeapUsedMb,
    maxAiTickP95Ms,
    maxAiTickMaxMs,
    budgetBreaches,
    maxSimulationQueueDepth,
    topReasons: latestAiDebug.reasons.slice(0, 8),
    sampledAt: new Date().toISOString(),
    startupSec: Number(((Date.now() - startedAt) / 1000).toFixed(1))
  };

  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) throw new Error("runtime benchmark constraints failed");
} finally {
  await stopServer();
  if (stdout.trim()) console.error(stdout.trim());
  if (stderr.trim()) console.error(stderr.trim());
}
