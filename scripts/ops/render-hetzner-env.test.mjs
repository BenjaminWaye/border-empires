import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { hetznerEnvTargets, renderEnvFile } from "./render-hetzner-env.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("renderEnvFile sorts keys, writes spaced values raw, and forces the metrics host override", () => {
  const out = renderEnvFile(
    `[env]\n  ZED = "1"\n  NODE_OPTIONS = "--max-old-space-size=900"\n  LABEL = "has space"\n  SIMULATION_METRICS_HOST = "127.0.0.1"\n\n[http_service]\n  x = 1\n`,
    "demo.toml"
  );
  assert.match(out, /^# GENERATED from demo\.toml/);
  assert.match(out, /^LABEL=has space$/m);
  assert.match(out, /NODE_OPTIONS=--max-old-space-size=900/);
  assert.match(out, /SIMULATION_METRICS_HOST=0\.0\.0\.0/);
  assert.ok(out.indexOf("LABEL=") < out.indexOf("ZED="));
  assert.doesNotMatch(out, /http_service|x = 1/);
});

test("renderEnvFile adds DEPLOY_APP_NAME when given an app name", () => {
  assert.match(renderEnvFile(`[env]\n  A = "1"\n`, "demo.toml", "my-app"), /^DEPLOY_APP_NAME=my-app$/m);
});

test("renderEnvFile refuses values that cannot be written portably", () => {
  assert.throws(() => renderEnvFile(`[env]\n  BAD = "a#b"\n`, "demo.toml"), /BAD/);
});

test("committed Hetzner env files match the Fly tomls they are rendered from", () => {
  for (const target of hetznerEnvTargets) {
    const expected = renderEnvFile(readFileSync(resolve(root, target.toml), "utf8"), target.toml, target.appName);
    assert.equal(readFileSync(resolve(root, target.out), "utf8"), expected, `${target.out} is stale`);
  }
});
