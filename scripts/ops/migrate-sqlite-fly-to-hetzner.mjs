#!/usr/bin/env node
// Moves the live SQLite DB from a Fly app to a Hetzner server.
//
//  1. Snapshot the Fly DB (VACUUM INTO + sftp) via clone-prod-sqlite-snapshot.mjs.
//  2. Integrity-check the local copy.
//  3. scp it to the server, stop the app there, install it into
//     /srv/border-empires/data (owner 10001), drop stale -wal/-shm files.
//
// It does NOT start the app and does NOT stop Fly. Phase 3 (rehearsal): run it
// against the live Fly app. Phases 4/6 (cutover): first freeze the Fly app so
// no writes are lost -- stop the machine, restart it with the entrypoint
// overridden to `sleep infinity` so the app is not running but `flyctl ssh`
// still works -- then run this, then `ssh deploy@host <sha>` (or the deploy
// workflow). See docs/hetzner-migration-plan.md.
//
// Usage:
//   pnpm ops:hetzner:migrate-db --fly-app border-empires-combined-staging --host deploy@<ip> [--ssh-opts '-i ~/.ssh/key']
//   Add --yes to skip the confirmation prompt.

import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { DatabaseSync } from "node:sqlite";

const parseArgs = (argv) => {
  const args = { yes: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--fly-app") args.flyApp = argv[++i];
    else if (argv[i] === "--host") args.host = argv[++i];
    else if (argv[i] === "--ssh-opts") args.sshOpts = argv[++i];
    else if (argv[i] === "--yes") args.yes = true;
    else {
      console.error(`Unknown argument: ${argv[i]}`);
      process.exit(2);
    }
  }
  if (!args.flyApp || !args.host) {
    console.error("Usage: migrate-sqlite-fly-to-hetzner --fly-app <app> --host <user@host> [--ssh-opts '<opts>'] [--yes]");
    process.exit(2);
  }
  return args;
};

const { flyApp, host, sshOpts, yes } = parseArgs(process.argv.slice(2));
const sshArgs = sshOpts ? sshOpts.split(" ") : [];

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.status !== 0) {
    console.error(`${command} ${args.join(" ")} failed (exit ${result.status})`);
    process.exit(1);
  }
};

if (!yes) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(
    `This REPLACES the database on ${host} with a snapshot of ${flyApp}. Type "migrate" to continue: `
  );
  rl.close();
  if (answer.trim() !== "migrate") process.exit(1);
}

// 1. Snapshot (the clone script prints local_db=<path>).
const clone = spawnSync("node", ["./scripts/ops/clone-prod-sqlite-snapshot.mjs", "--app", flyApp], {
  encoding: "utf8",
  stdio: ["inherit", "pipe", "inherit"]
});
process.stdout.write(clone.stdout ?? "");
if (clone.status !== 0) process.exit(1);
const localDb = clone.stdout.match(/local_db=(.*)/)?.[1]?.trim();
if (!localDb) {
  console.error("could not find local_db= in clone output");
  process.exit(1);
}

// 2. Integrity.
const check = new DatabaseSync(localDb, { readOnly: true }).prepare("PRAGMA integrity_check").get();
if (Object.values(check)[0] !== "ok") {
  console.error("local snapshot failed integrity_check:", check);
  process.exit(1);
}
console.log("local snapshot integrity_check: ok");

// 3. Ship + install.
const remoteTmp = "/tmp/border-empires-incoming.db";
run("scp", [...sshArgs, localDb, `${host}:${remoteTmp}`]);
// alpine runs as root inside docker, which lets the unprivileged deploy user
// write into the 10001-owned data dir without sudo.
const installScript = `set -euo pipefail
if [ -d /opt/border-empires ]; then (cd /opt/border-empires && docker compose stop app) || true; fi
docker run --rm -v /srv/border-empires/data:/data -v ${remoteTmp}:/incoming.db:ro alpine:3 sh -c 'cp /incoming.db /data/border-empires.db && rm -f /data/border-empires.db-wal /data/border-empires.db-shm && chown 10001:10001 /data/border-empires.db && ls -l /data/border-empires.db'
rm -f ${remoteTmp}
`;
run("ssh", [...sshArgs, host, "bash", "-s"], { input: installScript, stdio: ["pipe", "inherit", "inherit"] });
console.log(`installed. Next: deploy a sha to the host, then verify tile/player counts against ${flyApp}.`);
