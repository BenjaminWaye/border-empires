#!/usr/bin/env node
import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const gatewayHealthzUrl = process.env.GATEWAY_HEALTHZ_URL ?? "http://127.0.0.1:3101/healthz";
const simulationHealthzUrl = process.env.SIMULATION_HEALTHZ_URL ?? "http://127.0.0.1:50052/healthz";
const expectedSeasonId = process.env.RUNTIME_EXPECT_SEASON_ID;
const expectedWorldSeed = process.env.RUNTIME_EXPECT_WORLD_SEED;
const expectedSnapshotLabel = process.env.RUNTIME_EXPECT_SNAPSHOT_LABEL;
const expectedFingerprint = process.env.RUNTIME_EXPECT_FINGERPRINT;
const soakMinutes = Math.max(1, Number(process.env.CUTOVER_SOAK_MINUTES ?? "5"));

const fetchJson = async (url) => {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`health check failed ${url}: ${response.status}`);
  return response.json();
};

const assertRuntimeIdentity = (serviceName, health) => {
  const runtimeIdentity = health?.runtimeIdentity;
  if (!runtimeIdentity || typeof runtimeIdentity !== "object") {
    throw new Error(`${serviceName} healthz missing runtimeIdentity`);
  }
  if (typeof runtimeIdentity.sourceType !== "string") throw new Error(`${serviceName} runtimeIdentity.sourceType missing`);
  if (typeof runtimeIdentity.seasonId !== "string") throw new Error(`${serviceName} runtimeIdentity.seasonId missing`);
  if (typeof runtimeIdentity.worldSeed !== "number") throw new Error(`${serviceName} runtimeIdentity.worldSeed missing`);
  if (typeof runtimeIdentity.fingerprint !== "string") throw new Error(`${serviceName} runtimeIdentity.fingerprint missing`);
  if (typeof runtimeIdentity.playerCount !== "number") throw new Error(`${serviceName} runtimeIdentity.playerCount missing`);
  if (typeof runtimeIdentity.seededTileCount !== "number") throw new Error(`${serviceName} runtimeIdentity.seededTileCount missing`);

  if (expectedSeasonId && runtimeIdentity.seasonId !== expectedSeasonId) {
    throw new Error(`${serviceName} seasonId mismatch: expected=${expectedSeasonId} got=${runtimeIdentity.seasonId}`);
  }
  if (expectedWorldSeed && runtimeIdentity.worldSeed !== Number(expectedWorldSeed)) {
    throw new Error(`${serviceName} worldSeed mismatch: expected=${expectedWorldSeed} got=${runtimeIdentity.worldSeed}`);
  }
  if (expectedSnapshotLabel && runtimeIdentity.snapshotLabel !== expectedSnapshotLabel) {
    throw new Error(
      `${serviceName} snapshotLabel mismatch: expected=${expectedSnapshotLabel} got=${runtimeIdentity.snapshotLabel ?? ""}`
    );
  }
  if (expectedFingerprint && runtimeIdentity.fingerprint !== expectedFingerprint) {
    throw new Error(`${serviceName} fingerprint mismatch: expected=${expectedFingerprint} got=${runtimeIdentity.fingerprint}`);
  }
};

const runLoadHarness = async () => {
  const harnessScript = resolve(root, "scripts", "rewrite-load-harness.mjs");
  const env = {
    ...process.env,
    LOAD_HARNESS_SOAK_MINUTES: String(soakMinutes)
  };

  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [harnessScript], { cwd: root, env, stdio: "inherit" });
    child.on("error", rejectPromise);
    child.on("close", (code) => {
      if (code !== 0) {
        rejectPromise(new Error(`rewrite-load-harness exited with code ${code}`));
        return;
      }
      resolvePromise();
    });
  });
};

const gatewayHealth = await fetchJson(gatewayHealthzUrl);
if (gatewayHealth?.ok !== true) throw new Error(`gateway healthz reported non-ok state`);
assertRuntimeIdentity("gateway", gatewayHealth);

const simulationHealth = await fetchJson(simulationHealthzUrl);
if (simulationHealth?.ok !== true) throw new Error(`simulation healthz reported non-ok state`);
assertRuntimeIdentity("simulation", simulationHealth);

await runLoadHarness();

console.log(
  JSON.stringify(
    {
      ok: true,
      checkedAt: new Date().toISOString(),
      gatewayHealthzUrl,
      simulationHealthzUrl,
      soakMinutes,
      runtimeIdentity: {
        gateway: gatewayHealth.runtimeIdentity,
        simulation: simulationHealth.runtimeIdentity
      }
    },
    null,
    2
  )
);
