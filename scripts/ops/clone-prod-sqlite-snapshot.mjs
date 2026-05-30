#!/usr/bin/env node
// SQLite-aware replacement for the deleted Postgres `clone-snapshot` script.
//
// Downloads the live combined-stack SQLite database (and its WAL/SHM
// sidecars) from the prod Fly app into a local clone directory, so the
// candidate stack can boot against a real prod-shaped world for
// `pnpm ops:prod-shape:gate`.
//
// The 2026-05-18 v6 outage is the reason the gate exists at all — per-tick
// AI command paths only fail under accumulated prod-shaped state.
//
// Why all three files: the prod database runs in WAL mode (verified via
// `ls /data/border-empires.db*`). A consistent snapshot needs the main
// file + the WAL (in-flight transactions) + the SHM (shared-memory index).
// SQLite replays the WAL on open, so opening the local clone yields a
// consistent point-in-time view even though the three files are pulled
// sequentially. For a load-shape test that fidelity is sufficient.
//
// Usage:
//   pnpm ops:prod-shape:clone-snapshot
//   pnpm ops:prod-shape:clone-snapshot --app border-empires-combined-staging
//   pnpm ops:prod-shape:clone-snapshot --dest ./.prod-shape-clones/manual
//   pnpm ops:prod-shape:clone-snapshot --force          # overwrite existing
//
// Prints the env block to set before running the candidate stack and the
// gate. The intended follow-on flow is documented in docs/agents/deploys.md.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_APP = "border-empires-combined";
const REMOTE_DB_PATH = "/data/border-empires.db";
const REMOTE_WAL_PATH = "/data/border-empires.db-wal";
const REMOTE_SHM_PATH = "/data/border-empires.db-shm";

const parseArgs = (argv) => {
  const args = { force: false };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--app") args.app = argv[++i];
    else if (token === "--dest") args.dest = argv[++i];
    else if (token === "--force") args.force = true;
    else if (token === "--help" || token === "-h") args.help = true;
    else {
      console.error(`Unknown argument: ${token}`);
      process.exit(2);
    }
  }
  return args;
};

const printHelp = () => {
  console.log(
    `Usage: pnpm ops:prod-shape:clone-snapshot [--app <fly-app>] [--dest <dir>] [--force]\n` +
      `\nDefault app: ${DEFAULT_APP}\n` +
      `Default dest: ./.prod-shape-clones/<utc-stamp>\n`
  );
};

const utcStamp = (date = new Date()) => {
  const pad = (v) => String(v).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}` +
    `${pad(date.getUTCMonth() + 1)}` +
    `${pad(date.getUTCDate())}` +
    `${pad(date.getUTCHours())}` +
    `${pad(date.getUTCMinutes())}` +
    `${pad(date.getUTCSeconds())}`
  );
};

const requireFlyctl = () => {
  const result = spawnSync("flyctl", ["version"], { stdio: "ignore" });
  if (result.status !== 0) {
    console.error("flyctl is not installed or not on PATH. Install: https://fly.io/docs/flyctl/install/");
    process.exit(1);
  }
};

const requireFlyAuth = () => {
  const result = spawnSync("flyctl", ["auth", "whoami"], { encoding: "utf8" });
  if (result.status !== 0) {
    console.error(`flyctl is not authenticated. Run: flyctl auth login`);
    console.error(result.stderr || result.stdout || "");
    process.exit(1);
  }
  return result.stdout.trim();
};

// Returns size in bytes of remote file, or null if absent.
const remoteFileSize = (app, remotePath) => {
  const result = spawnSync(
    "flyctl",
    ["ssh", "console", "-a", app, "-C", `stat -c %s ${remotePath}`],
    { encoding: "utf8" }
  );
  if (result.status !== 0) return null;
  const match = result.stdout.match(/(\d+)/);
  return match ? Number(match[1]) : null;
};

const sftpGet = (app, remotePath, localPath) => {
  console.log(`  → ${remotePath} -> ${localPath}`);
  // flyctl ssh sftp get writes the file to the current cwd by default if
  // [local-path] is a directory; pass an explicit file path to control name.
  const result = spawnSync(
    "flyctl",
    ["ssh", "sftp", "get", "-a", app, remotePath, localPath],
    { stdio: "inherit" }
  );
  if (result.status !== 0) {
    throw new Error(`sftp get failed for ${remotePath} (exit ${result.status})`);
  }
  if (!existsSync(localPath)) {
    throw new Error(`sftp get reported success but ${localPath} is missing`);
  }
};

const formatBytes = (n) => {
  if (n === null || n === undefined) return "?";
  const units = ["B", "KiB", "MiB", "GiB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};

const main = () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  const app = args.app ?? DEFAULT_APP;
  const dest = resolve(args.dest ?? `./.prod-shape-clones/${utcStamp()}`);

  requireFlyctl();
  const flyUser = requireFlyAuth();
  console.log(`[clone-snapshot] app=${app} dest=${dest} fly-user=${flyUser}`);

  if (existsSync(dest)) {
    if (!args.force) {
      console.error(`destination already exists: ${dest}\nPass --force to overwrite.`);
      process.exit(1);
    }
    rmSync(dest, { recursive: true, force: true });
  }
  mkdirSync(dest, { recursive: true });

  console.log("[clone-snapshot] sizing remote files");
  const dbSize = remoteFileSize(app, REMOTE_DB_PATH);
  const walSize = remoteFileSize(app, REMOTE_WAL_PATH);
  const shmSize = remoteFileSize(app, REMOTE_SHM_PATH);
  if (dbSize === null) {
    console.error(`remote ${REMOTE_DB_PATH} not found on ${app} — wrong app or volume not mounted?`);
    process.exit(1);
  }
  console.log(
    `  ${REMOTE_DB_PATH}     ${formatBytes(dbSize)}\n` +
      `  ${REMOTE_WAL_PATH} ${formatBytes(walSize)}\n` +
      `  ${REMOTE_SHM_PATH} ${formatBytes(shmSize)}`
  );

  console.log("[clone-snapshot] downloading (this may take a few minutes on a multi-hundred-MB db)");
  const localDb = resolve(dest, "border-empires.db");
  const localWal = resolve(dest, "border-empires.db-wal");
  const localShm = resolve(dest, "border-empires.db-shm");
  sftpGet(app, REMOTE_DB_PATH, localDb);
  // WAL/SHM are best-effort: a freshly checkpointed db may not have them.
  try {
    if (walSize !== null) sftpGet(app, REMOTE_WAL_PATH, localWal);
  } catch (error) {
    console.warn(`  WAL pull failed (ok if writer just checkpointed): ${error.message}`);
  }
  try {
    if (shmSize !== null) sftpGet(app, REMOTE_SHM_PATH, localShm);
  } catch (error) {
    console.warn(`  SHM pull failed (ok if writer just checkpointed): ${error.message}`);
  }

  const localSize = statSync(localDb).size;
  console.log(
    `\n[clone-snapshot] done. Local db: ${localDb} (${formatBytes(localSize)})\n`
  );
  console.log(
    `Next steps:\n` +
      `  1. Boot the candidate combined stack against this clone:\n\n` +
      `       GATEWAY_SQLITE_PATH="${localDb}" \\\n` +
      `       SIMULATION_SQLITE_PATH="${localDb}" \\\n` +
      `         pnpm dev\n\n` +
      `  2. In another shell, wait for /health to respond on 127.0.0.1:3101, then run the gate:\n\n` +
      `       PROD_SHAPE_TARGET_SHA="$(git rev-parse HEAD)" \\\n` +
      `       PROD_SHAPE_OUTPUT_PATH="docs/load-results/prod-shape-$(git rev-parse --short HEAD).json" \\\n` +
      `         pnpm ops:prod-shape:gate\n\n` +
      `  3. Verify and feed into the deploy:\n\n` +
      `       PROD_SHAPE_GATE_RESULT_JSON="docs/load-results/prod-shape-$(git rev-parse --short HEAD).json" \\\n` +
      `         pnpm deploy:prod:all\n`
  );
};

try {
  main();
} catch (error) {
  console.error(`[clone-snapshot] ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
