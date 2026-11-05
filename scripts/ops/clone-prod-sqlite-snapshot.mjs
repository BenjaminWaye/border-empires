#!/usr/bin/env node
// Downloads a consistent SQLite snapshot from a live Hetzner backend. The
// server's `snapshot` forced command runs VACUUM INTO (atomic, single-file,
// no WAL/SHM coordination) and streams the result; see clone-snapshot-ssh.mjs.
//
// Pulling the live .db + .db-wal + .db-shm separately is fundamentally broken
// against a WAL-mode database — the main file lands torn because the writer is
// mid-transaction during every pull (verified 2026-05-30: integrity_check
// errors, snapshot_payload BLOBs lost). Always snapshot server-side.
//
// The 2026-05-18 v6 outage is the reason the gate exists at all — per-tick
// AI command paths only fail under accumulated prod-shaped state.
//
// Usage:
//   pnpm ops:prod-shape:clone-snapshot --ssh deploy@<host>
//   pnpm ops:prod-shape:clone-snapshot --ssh deploy@<host> --ssh-opts '-i ~/.ssh/key'
//   pnpm ops:prod-shape:clone-snapshot --ssh deploy@<host> --dest ./.prod-shape-clones/manual
//   pnpm ops:prod-shape:clone-snapshot --ssh deploy@<host> --force   # overwrite existing
//
// Prints the env block to set before running the candidate stack and the
// gate. The intended follow-on flow is documented in docs/agents/deploys.md.

import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";

import { cloneSnapshotViaSsh } from "./clone-snapshot-ssh.mjs";

const parseArgs = (argv) => {
  const args = { force: false };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--dest") args.dest = argv[++i];
    else if (token === "--ssh") args.ssh = argv[++i];
    else if (token === "--ssh-opts") args.sshOpts = argv[++i];
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
    `Usage: pnpm ops:prod-shape:clone-snapshot --ssh <user@host> [--ssh-opts '<opts>'] [--dest <dir>] [--force]\n` +
      `\nDefault dest: ./.prod-shape-clones/<utc-stamp>\n`
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

const printNextSteps = (localDb) => {
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
      `  3. Verify the result:\n\n` +
      `       PROD_SHAPE_GATE_RESULT_JSON="docs/load-results/prod-shape-$(git rev-parse --short HEAD).json" \\\n` +
      `         pnpm ops:prod-shape:verify --target-sha "$(git rev-parse HEAD)"\n`
  );
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  if (!args.ssh) {
    printHelp();
    process.exit(2);
  }
  const dest = resolve(args.dest ?? `./.prod-shape-clones/${utcStamp()}`);
  if (existsSync(dest)) {
    if (!args.force) {
      console.error(`destination already exists: ${dest}\nPass --force to overwrite.`);
      process.exit(1);
    }
    rmSync(dest, { recursive: true, force: true });
  }
  const localDb = await cloneSnapshotViaSsh({
    host: args.ssh,
    dest,
    sshOpts: args.sshOpts ? args.sshOpts.split(" ") : []
  });
  printNextSteps(localDb);
};

main().catch((error) => {
  console.error(`[clone-snapshot] ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
