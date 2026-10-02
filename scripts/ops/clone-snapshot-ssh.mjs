// SSH-backed variant of the prod-shape snapshot clone, for the Hetzner backend.
//
// The server-side forced command (`deploy/bin/deploy snapshot`) runs VACUUM INTO
// and streams the resulting file on stdout; we write it straight to disk and
// integrity-check it. No scp, no remote temp-file bookkeeping, and it works with
// the restricted CI key. The Fly path (--app) stays in clone-prod-sqlite-snapshot.mjs.

import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { pipeline } from "node:stream/promises";

export const cloneSnapshotViaSsh = async ({ host, dest, sshOpts = [] }) => {
  mkdirSync(dest, { recursive: true });
  const localDb = resolve(dest, "border-empires.db");
  console.log(`[clone-snapshot] ssh=${host} dest=${dest}`);
  console.log("[clone-snapshot] creating server-side snapshot via VACUUM INTO (30-60s on a large database)");
  const child = spawn("ssh", [...sshOpts, host, "snapshot"], { stdio: ["ignore", "pipe", "inherit"] });
  const exited = new Promise((resolveExit) => child.on("close", resolveExit));
  await pipeline(child.stdout, createWriteStream(localDb));
  const exitCode = await exited;
  if (exitCode !== 0) throw new Error(`ssh snapshot failed (exit ${exitCode})`);

  const size = statSync(localDb).size;
  if (size === 0) throw new Error("snapshot is empty");
  const { DatabaseSync } = await import("node:sqlite"); // lazy: avoids the experimental-warning noise elsewhere
  const db = new DatabaseSync(localDb, { readOnly: true });
  const check = db.prepare("PRAGMA integrity_check").get();
  db.close();
  if (Object.values(check)[0] !== "ok") throw new Error(`integrity_check failed: ${JSON.stringify(check)}`);

  console.log(`\n[clone-snapshot] done. Local db: ${localDb} (${(size / 1024 / 1024).toFixed(1)} MiB)`);
  // Same machine-readable line deploy-prod.yml greps for.
  console.log(`[clone-snapshot] local_db=${localDb}`);
  return localDb;
};

