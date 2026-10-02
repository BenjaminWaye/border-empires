#!/usr/bin/env node
// Renders deploy/env/<env>.env (a Docker env_file) from the [env]
// block of the matching fly.combined*.toml, so the toml stays the single source
// of truth while Fly is still the deploy target.
//
// Usage:
//   pnpm ops:hetzner:render-env            # rewrite both env files
//   pnpm ops:hetzner:render-env --check    # exit 1 if committed files are stale

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseTomlEnvSection } from "../check-staging-fly-env-drift.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export const hetznerEnvTargets = [
  { name: "staging", toml: "fly.combined.staging.toml", out: "deploy/env/staging.env", appName: "border-empires-combined-staging" },
  { name: "production", toml: "fly.combined.toml", out: "deploy/env/production.env", appName: "border-empires-combined" }
];

// Host-loopback publishing of the metrics port (docker-compose.yml) needs the
// listener on 0.0.0.0 *inside* the container; it is never exposed publicly.
const HETZNER_OVERRIDES = { SIMULATION_METRICS_HOST: "0.0.0.0" };

// Values are written raw (spaces allowed, e.g. NODE_OPTIONS). `docker run
// --env-file` does not strip quotes while `docker compose` does, so quoting is
// unsafe in one of the two; refuse characters that would need it instead.
const formatValue = (key, value) => {
  if (/[#"'$\\\r\n]|^\s|\s$/.test(value)) {
    throw new Error(`${key} has a value that cannot be written to a Docker env_file portably; handle it explicitly`);
  }
  return value;
};

// DEPLOY_APP_NAME replaces FLY_APP_NAME as the environment label off Fly.
export const renderEnvFile = (tomlSource, sourceName, appName) => {
  const env = {
    ...parseTomlEnvSection(tomlSource),
    ...HETZNER_OVERRIDES,
    ...(appName ? { DEPLOY_APP_NAME: appName } : {})
  };
  const lines = Object.entries(env)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${formatValue(key, String(value))}`);
  return [
    `# GENERATED from ${sourceName} by scripts/ops/render-hetzner-env.mjs -- do not edit.`,
    "# Non-secret container env. Secrets live in /etc/border-empires/secrets.env on the server.",
    ...lines,
    ""
  ].join("\n");
};

const main = () => {
  const check = process.argv.includes("--check");
  let stale = false;
  for (const target of hetznerEnvTargets) {
    const rendered = renderEnvFile(readFileSync(resolve(root, target.toml), "utf8"), target.toml, target.appName);
    const outPath = resolve(root, target.out);
    if (check) {
      let current = "";
      try {
        current = readFileSync(outPath, "utf8");
      } catch {
        // missing counts as stale
      }
      if (current !== rendered) {
        console.error(`${target.out} is stale; run: pnpm ops:hetzner:render-env`);
        stale = true;
      }
    } else {
      writeFileSync(outPath, rendered);
      console.log(`wrote ${target.out}`);
    }
  }
  if (stale) process.exit(1);
};

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
