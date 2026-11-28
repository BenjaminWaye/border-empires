// deploy/env/*.env are hand-maintained Docker env_files (they used to be
// rendered from the Fly tomls). These checks keep the guarantees the renderer
// gave: portable values, sorted unique keys, and the Hetzner-specific settings.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const envFiles = [
  { path: "deploy/env/staging.env", appName: "border-empires-combined-staging", nodeEnv: "staging" },
  { path: "deploy/env/production.env", appName: "border-empires-combined", nodeEnv: "production" },
  // Hosted sectors are production servers (managed-runtime checks apply).
  { path: "deploy/env/hosted.env", appName: "border-empires-hosted", nodeEnv: "production" }
];

const parseEnvFile = (source) =>
  source
    .split("\n")
    .filter((line) => line !== "" && !line.startsWith("#"))
    .map((line) => {
      const eq = line.indexOf("=");
      assert.ok(eq > 0, `not a KEY=value line: ${line}`);
      return [line.slice(0, eq), line.slice(eq + 1)];
    });

for (const file of envFiles) {
  const entries = parseEnvFile(readFileSync(resolve(root, file.path), "utf8"));
  const env = Object.fromEntries(entries);

  test(`${file.path} has sorted, unique keys`, () => {
    const keys = entries.map(([key]) => key);
    assert.deepEqual(keys, [...keys].sort((a, b) => a.localeCompare(b)));
    assert.equal(new Set(keys).size, keys.length);
  });

  // `docker run --env-file` does not strip quotes while `docker compose` does,
  // so any value that would need quoting is unsafe in one of the two.
  test(`${file.path} values are portable across docker run and docker compose`, () => {
    for (const [key, value] of entries) {
      assert.doesNotMatch(value, /[#"'$\\\r]|^\s|\s$/, `${key} needs quoting`);
    }
  });

  test(`${file.path} carries the Hetzner deployment settings`, () => {
    assert.equal(env.DEPLOY_APP_NAME, file.appName);
    assert.equal(env.NODE_ENV, file.nodeEnv);
    // Host-loopback publishing of the metrics port needs the listener on
    // 0.0.0.0 inside the container; it is never exposed publicly.
    assert.equal(env.SIMULATION_METRICS_HOST, "0.0.0.0");
  });
}

// The heap limit and the two checkpoint watermarks are one decision
// (docs/load-results/sim-heap-growth-2026-11-28.md §6): a heap watermark at or
// above the limit can never fire, so the "don't start a checkpoint when memory
// is short" guard would silently be off. Keep them in step across all files.
const memorySettings = (path) => {
  const env = Object.fromEntries(parseEnvFile(readFileSync(resolve(root, path), "utf8")));
  const heapLimitMb = Number(/--max-old-space-size=(\d+)/.exec(env.NODE_OPTIONS ?? "")?.[1]);
  return {
    heapLimitMb,
    heapWatermarkMb: Number(env.SIMULATION_CHECKPOINT_MAX_HEAP_USED_MB),
    rssWatermarkMb: Number(env.SIMULATION_CHECKPOINT_MAX_RSS_MB)
  };
};

test("heap limit and checkpoint watermarks agree across env files", () => {
  const [first, ...rest] = envFiles.map((file) => memorySettings(file.path));
  for (const other of rest) assert.deepEqual(other, first);
});

for (const file of envFiles) {
  test(`${file.path} keeps the checkpoint heap watermark below the heap limit`, () => {
    const { heapLimitMb, heapWatermarkMb, rssWatermarkMb } = memorySettings(file.path);
    assert.ok(Number.isFinite(heapLimitMb) && heapLimitMb > 0, "NODE_OPTIONS must set --max-old-space-size");
    // Room for a checkpoint build between the watermark and the limit.
    assert.ok(heapWatermarkMb > 0 && heapWatermarkMb <= heapLimitMb - 128, `heap watermark ${heapWatermarkMb} too close to limit ${heapLimitMb}`);
    assert.ok(rssWatermarkMb > heapLimitMb, `process watermark ${rssWatermarkMb} must exceed the simulation heap limit ${heapLimitMb}`);
  });
}
