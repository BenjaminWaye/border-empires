#!/usr/bin/env node
// Downloads a consistent SQLite snapshot from a live Fly app via server-side
// VACUUM INTO, producing a single clean file with no WAL/SHM coordination.
//
// Previous approach pulled the main .db + .db-wal + .db-shm sequentially via
// SFTP. That is fundamentally broken against a live WAL-mode database — the
// main file lands torn because the writer is mid-transaction during every
// pull. Verified 2026-05-30: PRAGMA integrity_check returned btree errors,
// .recover dropped the 28MB snapshot_payload BLOBs, making the clone unusable
// for the prod-shape gate.
//
// Fix: run VACUUM INTO server-side (atomic, single-file, defragmented), then
// SFTP pull the one output file. VACUUM INTO holds a read lock for ~30-60s on
// a ~1GB DB; writes queue during that window — acceptable for a pre-deploy
// gate that runs once per deploy.
//
// The 2026-05-18 v6 outage is the reason the gate exists at all — per-tick
// AI command paths only fail under accumulated prod-shaped state.
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
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const DEFAULT_APP = "border-empires-combined";
const REMOTE_DB_PATH = "/data/border-empires.db";
const REMOTE_SNAPSHOT_PATH = "/tmp/border-empires.snapshot.db";
// .cjs forces CommonJS so `require("node:sqlite")` works regardless of
// whether the remote /tmp has a package.json with "type": "module".
const REMOTE_SNAPSHOT_SCRIPT = "/tmp/border-empires-snapshot.cjs";

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

// Runs a command on the remote Fly app via `flyctl ssh console -C`.
// Returns { ok: true, stdout } or { ok: false, stderr, status }.
const sshExec = (app, command) => {
  const result = spawnSync(
    "flyctl",
    ["ssh", "console", "-a", app, "-C", command],
    { encoding: "utf8" }
  );
  if (result.status !== 0) {
    return { ok: false, stderr: result.stderr, status: result.status };
  }
  return { ok: true, stdout: result.stdout };
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

// Run VACUUM INTO on the remote server to produce a consistent snapshot.
// Returns { ok: true } on success, or throws on failure.
//
// Writes a self-cleaning Node script locally, uploads via SFTP, and runs it
// with a plain `node /tmp/script.cjs` command (no shell metacharacters).
// flyctl ssh console -C does NOT invoke a shell — it passes arguments directly
// to SSH exec, so `;`, `&&`, `$?` would be literal characters, not operators.
// The script cleans up after itself with fs.unlinkSync(__filename).
const createServerSnapshot = (app) => {
  // Self-cleaning: unlinks itself in finally so the remote `node` invocation
  // is the only command needed — no shell-dependent cleanup chain.
  const nodeScript = [
    'const{DatabaseSync}=require("node:sqlite")',
    `const db=new DatabaseSync("${REMOTE_DB_PATH}")`,
    `try{db.exec(\`VACUUM INTO '${REMOTE_SNAPSHOT_PATH}'\`);db.close();console.log("ok")}finally{try{require("fs").unlinkSync(__filename)}catch{}}`
  ].join(";");

  // Write locally, upload via SFTP to avoid all shell escaping.
  const localScript = resolve(tmpdir(), `be-snapshot-${Date.now()}.cjs`);
  writeFileSync(localScript, nodeScript);

  try {
    // Upload script to server
    console.log(`[clone-snapshot] uploading snapshot script to ${app}`);
    const putResult = spawnSync("flyctl", [
      "ssh", "sftp", "put", "-a", app,
      localScript, REMOTE_SNAPSHOT_SCRIPT
    ], { stdio: "inherit" });
    if (putResult.status !== 0) {
      throw new Error(`SFTP upload failed (exit ${putResult.status})`);
    }

    // Simple command: no `;`, no `&&`, no shell variables.
    // flyctl ssh console -C does not invoke a shell — just SSH exec.
    console.log(`[clone-snapshot] creating server-side snapshot via VACUUM INTO (this may take 30-60s on a large database)`);
    const result = sshExec(app, `node ${REMOTE_SNAPSHOT_SCRIPT}`);

    if (!result.ok) {
      const stderr = (result.stderr || "").trim();
      throw new Error(
        `VACUUM INTO failed on ${app} (exit ${result.status}): ${stderr || "no output"}`
      );
    }

    // Confirm the snapshot file exists on the server.
    const snapSize = remoteFileSize(app, REMOTE_SNAPSHOT_PATH);
    if (snapSize === null) {
      throw new Error(
        `VACUUM INTO completed but ${REMOTE_SNAPSHOT_PATH} not found on ${app}`
      );
    }

    console.log(`  Server snapshot: ${REMOTE_SNAPSHOT_PATH} (${formatBytes(snapSize)})`);
    return { ok: true, size: snapSize };
  } finally {
    // Always clean up the local temp script
    try { rmSync(localScript); } catch { /* best-effort */ }
  }
};

// Remove server-side snapshot and temp script. Best-effort — logs a warning
// on failure but does not throw (the local clone is already safe).
const cleanupServerSnapshot = (app) => {
  console.log(`[clone-snapshot] cleaning up server-side files`);
  const result = sshExec(app, `rm -f ${REMOTE_SNAPSHOT_PATH} ${REMOTE_SNAPSHOT_SCRIPT}`);
  if (!result.ok) {
    console.warn(`  Cleanup warning: rm failed (exit ${result.status}) — files may remain on ${app}`);
    return;
  }
  console.log(`  Removed ${REMOTE_SNAPSHOT_PATH}`);
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

  console.log("[clone-snapshot] sizing remote database");
  const dbSize = remoteFileSize(app, REMOTE_DB_PATH);
  if (dbSize === null) {
    console.error(`remote ${REMOTE_DB_PATH} not found on ${app} — wrong app or volume not mounted?`);
    process.exit(1);
  }
  console.log(`  ${REMOTE_DB_PATH}  ${formatBytes(dbSize)}`);

  // Create consistent snapshot server-side, then pull it.
  try {
    createServerSnapshot(app);
  } catch (error) {
    console.error(`[clone-snapshot] ${error.message}`);
    // Try to clean up server-side snapshot even on failure.
    try { cleanupServerSnapshot(app); } catch { /* best-effort */ }
    process.exit(1);
  }

  console.log("[clone-snapshot] downloading snapshot");
  const localDb = resolve(dest, "border-empires.db");
  try {
    sftpGet(app, REMOTE_SNAPSHOT_PATH, localDb);
  } catch (error) {
    console.error(`[clone-snapshot] ${error.message}`);
    try { cleanupServerSnapshot(app); } catch { /* best-effort */ }
    process.exit(1);
  }

  // Clean up server-side snapshot. Best-effort — the local file is safe.
  try {
    cleanupServerSnapshot(app);
  } catch (error) {
    console.warn(`[clone-snapshot] server cleanup threw: ${error.message}`);
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
