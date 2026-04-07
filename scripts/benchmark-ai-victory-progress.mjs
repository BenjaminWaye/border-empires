import { spawn } from "node:child_process";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

const cwd = process.cwd();
const port = Number(process.env.AI_BENCH_PORT ?? 3211);
const aiPlayers = Number(process.env.AI_BENCH_PLAYERS ?? 100);
const timeoutSec = Number(process.env.AI_VICTORY_TIMEOUT_SEC ?? 180);
const minDurationSec = Number(process.env.AI_VICTORY_MIN_DURATION_SEC ?? 25);
const sampleMs = Number(process.env.AI_VICTORY_SAMPLE_MS ?? 2000);
const serverUrl = `http://127.0.0.1:${port}`;
const startedAt = Date.now();
let readyAt = 0;

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

const quarterPathsForPlayer = (player, quarterRatio) =>
  player.progress
    .filter((entry) => entry.progressRatio >= quarterRatio)
    .sort((a, b) => b.progressRatio - a.progressRatio || a.id.localeCompare(b.id));

try {
  let runtime;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      runtime = await fetchJson("/admin/runtime/debug");
      readyAt = Date.now();
      break;
    } catch {
      await delay(1000);
    }
  }
  if (!runtime) throw new Error("server did not become ready");

  const runtimeSamples = [];
  let firstQuarterVictory;
  const perPathFirstQuarterVictory = {};
  let bestObserved = undefined;
  const deadline = Date.now() + timeoutSec * 1000;
  const minEndAt = Date.now() + minDurationSec * 1000;

  while (Date.now() < deadline) {
    const [runtimeSample, victorySample] = await Promise.all([
      fetchJson("/admin/runtime/debug"),
      fetchJson("/admin/ai/victory-progress")
    ]);
    runtimeSamples.push(runtimeSample);

    const aiPlayersProgress = victorySample.players.filter((player) => player.isAi);
    const strongestAi = aiPlayersProgress[0];
    if (!bestObserved || (strongestAi?.strongestProgressRatio ?? 0) > bestObserved.strongestProgressRatio) {
      bestObserved = strongestAi;
    }

    for (const player of aiPlayersProgress) {
      const crossed = quarterPathsForPlayer(player, victorySample.thresholds.quarterProgressRatio);
      if (crossed.length === 0) continue;
      if (!firstQuarterVictory) {
        const bestPath = crossed[0];
        firstQuarterVictory = {
          elapsedSec: Number(((Date.now() - startedAt) / 1000).toFixed(1)),
          sampledAt: new Date(victorySample.at).toISOString(),
          playerId: player.playerId,
          name: player.name,
          pathId: bestPath.id,
          progressRatio: bestPath.progressRatio,
          currentValue: bestPath.currentValue,
          requiredValue: bestPath.requiredValue
        };
      }
      for (const entry of crossed) {
        if (perPathFirstQuarterVictory[entry.id]) continue;
        perPathFirstQuarterVictory[entry.id] = {
          elapsedSec: Number(((Date.now() - startedAt) / 1000).toFixed(1)),
          sampledAt: new Date(victorySample.at).toISOString(),
          playerId: player.playerId,
          name: player.name,
          progressRatio: entry.progressRatio,
          currentValue: entry.currentValue,
          requiredValue: entry.requiredValue
        };
      }
    }

    if (Date.now() >= minEndAt && firstQuarterVictory) break;
    await delay(sampleMs);
  }

  const activeSamples = runtimeSamples.filter((sample) => sample.aiScheduler.totalAiPlayers > 0 || sample.history.aiTicks.length > 0);
  const samplesForAssertions = activeSamples.length > 0 ? activeSamples : runtimeSamples;
  const latestRuntime = runtimeSamples.at(-1) ?? runtime;
  const maxRssMb = Math.max(...runtimeSamples.map((sample) => sample.runtime.rssMb));
  const maxHeapUsedMb = Math.max(...runtimeSamples.map((sample) => sample.runtime.heapUsedMb));
  const maxAiTickP95Ms = Math.max(...runtimeSamples.map((sample) => sample.hotspots.aiTicks.p95Ms));
  const budgetBreaches = Math.max(...runtimeSamples.map((sample) => sample.aiBudget.breaches));
  const minAiPlayers = Math.min(...samplesForAssertions.map((sample) => sample.counts.aiPlayers));
  const maxScheduledAi = Math.max(...samplesForAssertions.map((sample) => sample.aiScheduler.totalAiPlayers));

  const result = {
    ok:
      Boolean(firstQuarterVictory) &&
      minAiPlayers >= aiPlayers &&
      maxScheduledAi >= aiPlayers &&
      budgetBreaches === 0 &&
      maxRssMb <= 512,
    brainMode: latestRuntime.aiBrain.mode,
    nodeOptions: serverEnv.NODE_OPTIONS,
    aiPlayersConfigured: aiPlayers,
    aiPlayersObserved: latestRuntime.counts.aiPlayers,
    scheduledAiObserved: latestRuntime.aiScheduler.totalAiPlayers,
    timeoutSec,
    minDurationSec,
    sampleMs,
    firstQuarterVictory,
    perPathFirstQuarterVictory,
    bestObservedAi: bestObserved
      ? {
          playerId: bestObserved.playerId,
          name: bestObserved.name,
          strongestPathId: bestObserved.strongestPathId,
          strongestProgressRatio: bestObserved.strongestProgressRatio
        }
      : undefined,
    maxRssMb,
    maxHeapUsedMb,
    maxAiTickP95Ms,
    budgetBreaches,
    startupSec: Number((((readyAt || Date.now()) - startedAt) / 1000).toFixed(1))
  };

  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) throw new Error("victory progress benchmark constraints failed");
} finally {
  await stopServer();
  if (process.env.AI_BENCH_VERBOSE === "1" && stdout.trim()) console.error(stdout.trim());
  if (stderr.trim()) console.error(stderr.trim());
}
