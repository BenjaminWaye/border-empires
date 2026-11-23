// Local-only launcher for the combined stack (simulation worker thread +
// gateway main thread, the same shape as main-merged.ts) with a throwaway
// Firebase signing key, so a probe client can log in as the fog admin and as
// any number of distinct humans without touching real Firebase.
//
// Requires `pnpm --filter @border-empires/simulation build` and
// `pnpm --filter @border-empires/realtime-gateway build` first.
//
// Env: everything main-merged.ts reads, plus
//   PROBE_DIR          directory for signing-key.pem and samples.jsonl (required)
//   PROBE_ADMIN_EMAIL  fog-admin address (default fog-admin@example.com)
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { Worker } from "node:worker_threads";
import { generateKeyPairSync } from "node:crypto";

const root = new URL("../../", import.meta.url);
const probeDir = process.env.PROBE_DIR;
if (!probeDir) throw new Error("PROBE_DIR is required");
mkdirSync(probeDir, { recursive: true });
const adminEmail = process.env.PROBE_ADMIN_EMAIL ?? "fog-admin@example.com";
const projectId = "border-empires-probe";

const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
writeFileSync(`${probeDir}/signing-key.pem`, keys.privateKey.export({ type: "pkcs8", format: "pem" }));

const worker = new Worker(new URL("apps/simulation/dist/worker-main.js", root));
worker.on("exit", (code) => { console.error(`[probe-stack] simulation worker exited code=${code}`); process.exit(code || 1); });
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
  ...(env.sqlitePath ? { sqlitePath: env.sqlitePath } : {}),
  applySchema: env.applySchema,
  simulationSeedProfile: env.simulationSeedProfile,
  allowNonAuthoritativeInitialState: env.allowNonAuthoritativeInitialState,
  ...(env.aiPlayerCount ? { aiPlayerCount: env.aiPlayerCount } : {}),
  emailAlerts: env.emailAlerts,
  adminEmail,
  firebaseProjectId: projectId,
  firebaseTokenVerifier: createFirebaseTokenVerifier({ projectId, keySet: async () => keys.publicKey }),
  simMetricsUrl: `http://${ready.metricsHost}:${ready.metricsPort}/metrics`
});
const started = await gateway.start();

// Main-thread (gateway) event-loop delay and whole-process memory, 1 Hz.
const loop = monitorEventLoopDelay({ resolution: 10 });
loop.enable();
let lastCpu = process.cpuUsage();
let lastAt = Date.now();
setInterval(() => {
  const mem = process.memoryUsage();
  const cpu = process.cpuUsage();
  const now = Date.now();
  const cpuPct = ((cpu.user + cpu.system - lastCpu.user - lastCpu.system) / 1000 / Math.max(1, now - lastAt)) * 100;
  lastCpu = cpu; lastAt = now;
  appendFileSync(`${probeDir}/samples.jsonl`, `${JSON.stringify({
    at: now,
    gatewayLoopMaxMs: Math.round(loop.max / 1e6),
    processCpuPct: Math.round(cpuPct),
    rssMb: Math.round(mem.rss / 1048576),
    gatewayHeapUsedMb: Math.round(mem.heapUsed / 1048576)
  })}\n`);
  loop.reset();
}, 1000).unref();

console.log(`[probe-stack] ready port=${started.port} adminEmail=${adminEmail} projectId=${projectId}`);
