// Local-only launcher for the combined stack (simulation worker thread +
// gateway main thread, the same shape as main-merged.ts) with a throwaway
// token-signing key, so probe.mjs can log in any number of distinct humans
// without touching real Firebase. Never deployed; nothing here runs in CI.
//
// Requires `pnpm --filter @border-empires/simulation build` and
// `pnpm --filter @border-empires/realtime-gateway build` first.
//
// Env: everything main-merged.ts reads, plus
//   PROBE_DIR         directory for signing-key.pem and process-samples.jsonl (required)
//   PROBE_STACK_ROOT  checkout whose built apps to run (default: this one), so an
//                     untouched build can be measured next to a changed one
//   PROBE_ADMIN_EMAIL the one account allowed to reveal the map (default
//                     fog-admin@example.com), for late-contest-probe.mjs
//
// SIGTERM or SIGINT stops it the way main-merged.ts does: the gateway closes,
// then the simulation saves its final checkpoint. The time that takes is
// logged as "[probe-stack] graceful stop".
//
// Writes one line per second to process-samples.jsonl: whole-process RSS (the
// number the checkpoint watermark compares against), the gateway thread's
// heap, CPU, and the gateway event-loop delay.
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { Worker } from "node:worker_threads";
import { generateKeyPairSync } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.env.PROBE_STACK_ROOT
  ? pathToFileURL(`${path.resolve(process.env.PROBE_STACK_ROOT)}/`)
  : new URL("../../", import.meta.url);
const probeDir = process.env.PROBE_DIR;
if (!probeDir) throw new Error("PROBE_DIR is required");
mkdirSync(probeDir, { recursive: true });
const projectId = "border-empires-probe";

const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
writeFileSync(`${probeDir}/signing-key.pem`, keys.privateKey.export({ type: "pkcs8", format: "pem" }));

const worker = new Worker(new URL("apps/simulation/dist/worker-main.js", root));
worker.on("exit", (code) => {
  console.error(`[probe-stack] simulation worker exited code=${code}`);
  process.exit(code || 1);
});
const ready = await new Promise((resolve, reject) => {
  worker.on("message", (msg) => {
    if (msg?.type === "ready") resolve(msg);
    if (msg?.type === "fatal") reject(new Error(`${msg.reason}: ${msg.error}`));
  });
});
process.env.SIMULATION_ADDRESS = `127.0.0.1:${process.env.SIMULATION_PORT ?? 50051}`;

const gatewayDist = new URL("apps/realtime-gateway/dist/realtime-gateway/src/", root);
const { createRealtimeGatewayApp } = await import(new URL("gateway-app/gateway-app.js", gatewayDist).href);
const { parseRealtimeGatewayRuntimeEnv } = await import(new URL("runtime-env/runtime-env.js", gatewayDist).href);
const { createFirebaseTokenVerifier } = await import(new URL("auth-identity/firebase-token-verifier.js", gatewayDist).href);
const env = parseRealtimeGatewayRuntimeEnv(process.env);
const gateway = await createRealtimeGatewayApp({
  host: env.host,
  port: env.port,
  simulationAddress: env.simulationAddress,
  ...(env.simulationWakeAddress ? { simulationWakeAddress: env.simulationWakeAddress } : {}),
  ...(env.sqlitePath ? { sqlitePath: env.sqlitePath } : {}),
  applySchema: env.applySchema,
  simulationSeedProfile: env.simulationSeedProfile,
  allowNonAuthoritativeInitialState: env.allowNonAuthoritativeInitialState,
  ...(env.aiPlayerCount ? { aiPlayerCount: env.aiPlayerCount } : {}),
  emailAlerts: env.emailAlerts,
  firebaseProjectId: projectId,
  adminEmail: process.env.PROBE_ADMIN_EMAIL ?? "fog-admin@example.com",
  firebaseTokenVerifier: createFirebaseTokenVerifier({ projectId, keySet: async () => keys.publicKey }),
  simMetricsUrl: `http://${ready.metricsHost}:${ready.metricsPort}/metrics`
});
const started = await gateway.start();

const loop = monitorEventLoopDelay({ resolution: 10 });
loop.enable();
let lastCpu = process.cpuUsage();
let lastAt = Date.now();
setInterval(() => {
  const mem = process.memoryUsage();
  const cpu = process.cpuUsage();
  const now = Date.now();
  const cpuPct = ((cpu.user + cpu.system - lastCpu.user - lastCpu.system) / 1000 / Math.max(1, now - lastAt)) * 100;
  lastCpu = cpu;
  lastAt = now;
  appendFileSync(
    `${probeDir}/process-samples.jsonl`,
    `${JSON.stringify({
      at: now,
      rssMb: Math.round(mem.rss / 1048576),
      gatewayHeapUsedMb: Math.round(mem.heapUsed / 1048576),
      gatewayHeapTotalMb: Math.round(mem.heapTotal / 1048576),
      externalMb: Math.round(mem.external / 1048576),
      arrayBuffersMb: Math.round(mem.arrayBuffers / 1048576),
      processCpuPct: Math.round(cpuPct),
      gatewayLoopMaxMs: Math.round(loop.max / 1e6)
    })}\n`
  );
  loop.reset();
}, 1000).unref();

let stopping = false;
const stop = async (signal) => {
  if (stopping) return;
  stopping = true;
  const startedAt = performance.now();
  setTimeout(() => process.exit(1), 60_000).unref();
  await gateway.close().catch((error) => console.error("[probe-stack] gateway close failed", error));
  const closed = new Promise((resolve) => {
    worker.on("message", (msg) => { if (msg?.type === "closed" || msg?.type === "fatal") resolve(); });
    worker.removeAllListeners("exit");
    worker.on("exit", resolve);
  });
  worker.postMessage({ type: "shutdown", reason: signal });
  await closed;
  console.log(`[probe-stack] graceful stop signal=${signal} ms=${Math.round(performance.now() - startedAt)}`);
  process.exit(0);
};
process.on("SIGTERM", () => void stop("SIGTERM"));
process.on("SIGINT", () => void stop("SIGINT"));

console.log(`[probe-stack] ready port=${started.port} projectId=${projectId}`);
