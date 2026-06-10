#!/usr/bin/env node
// Fly-only staging deploy — restarts the combined sim+gateway machine with the
// current fly.combined.staging.toml config, without touching the Vercel client.
//
// Use this when you need to change a backend env var (e.g. experiment flags)
// without triggering a full client rebuild + alias swap. For full releases
// (code changes that affect both backend and client), use deploy:staging:all.
//
// Same working-tree guards as deploy:staging:all: HEAD must match origin/main
// and the tree must be clean, so staging always runs exactly what's on main.

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const log = (msg) => console.log(`\n[deploy-staging-fly] ${msg}`);
const fail = (msg) => {
  console.error(`\n[deploy-staging-fly] ERROR: ${msg}`);
  process.exit(1);
};

const run = (command, args, options = {}) => {
  log(`$ ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? rootDir,
    env: options.env ?? process.env,
    encoding: "utf8",
    stdio: "inherit"
  });
  if (result.status !== 0) {
    fail(`${command} ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}`);
  }
};

const captureStdout = (command, args) => {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    env: process.env,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    fail(`${command} ${args.join(" ")} failed with exit ${result.status}: ${(result.stderr ?? "").trim()}`);
  }
  return result.stdout.trim();
};

const main = async () => {
  log("Fetching origin/main");
  run("git", ["fetch", "origin", "main"]);
  const targetSha = captureStdout("git", ["rev-parse", "origin/main"]);
  const targetShortSha = targetSha.slice(0, 7);
  log(`Target SHA: ${targetSha} (${targetShortSha})`);

  const headSha = captureStdout("git", ["rev-parse", "HEAD"]);
  if (headSha !== targetSha) {
    fail(
      `working tree HEAD ${headSha.slice(0, 7)} does not match origin/main ${targetShortSha}. ` +
        `Run from a checkout at origin/main.`
    );
  }
  const dirtyStatus = captureStdout("git", ["status", "--porcelain"]);
  if (dirtyStatus.length > 0) {
    fail(
      `working tree has uncommitted changes; refusing to deploy:\n${dirtyStatus}`
    );
  }

  log("Deploying merged sim+gateway to Fly (border-empires-combined-staging)");
  run("fly", [
    "deploy",
    "--config", "fly.combined.staging.toml",
    "--strategy", "rolling",
    "--remote-only",
    "--env", `BUILD_SHA=${targetSha}`
  ]);

  log(`Fly deploy complete. SHA: ${targetShortSha}`);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
