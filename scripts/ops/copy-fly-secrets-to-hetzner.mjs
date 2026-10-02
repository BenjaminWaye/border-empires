#!/usr/bin/env node
// Copies the Fly app's secrets to /etc/border-empires/secrets.env on a Hetzner
// server WITHOUT printing any value: names come from `flyctl secrets list`,
// values are read from the running Fly machine's environment, and the file is
// streamed straight into `ssh ... 'cat > file'`.
//
// Usage:
//   pnpm ops:hetzner:copy-fly-secrets --fly-app border-empires-combined-staging --host deploy@<ip>
//
// Review the result on the server afterwards (names only):
//   ssh deploy@<ip> "cut -d= -f1 /etc/border-empires/secrets.env"
// Values such as SIMULATION_SEASON_SCHEDULED_START_AT may be stale for a new
// environment -- check them deliberately.

import { spawnSync } from "node:child_process";

const parseArgs = (argv) => {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--fly-app") args.flyApp = argv[++i];
    else if (argv[i] === "--host") args.host = argv[++i];
    else if (argv[i] === "--ssh-opts") args.sshOpts = argv[++i];
    else {
      console.error(`Unknown argument: ${argv[i]}`);
      process.exit(2);
    }
  }
  if (!args.flyApp || !args.host) {
    console.error("Usage: copy-fly-secrets-to-hetzner --fly-app <app> --host <user@host> [--ssh-opts '<opts>']");
    process.exit(2);
  }
  return args;
};

const { flyApp, host, sshOpts } = parseArgs(process.argv.slice(2));

const list = spawnSync("flyctl", ["secrets", "list", "-a", flyApp, "--json"], { encoding: "utf8" });
if (list.status !== 0) {
  console.error(list.stderr || "flyctl secrets list failed");
  process.exit(1);
}
const names = JSON.parse(list.stdout)
  .map((row) => row.Name ?? row.name)
  .filter((name) => typeof name === "string" && /^[A-Z0-9_]+$/.test(name));

const lines = [];
for (const name of names) {
  const result = spawnSync("flyctl", ["ssh", "console", "-a", flyApp, "-C", `printenv ${name}`], { encoding: "utf8" });
  const value = result.stdout.replace(/\r?\n$/, "");
  if (result.status !== 0 || value === "") {
    console.error(`! could not read ${name} from ${flyApp}; skipping`);
    continue;
  }
  if (/[\r\n]/.test(value)) {
    console.error(`! ${name} is multi-line; add it to secrets.env by hand`);
    continue;
  }
  lines.push(`${name}=${value}`);
}

const put = spawnSync(
  "ssh",
  [...(sshOpts ? sshOpts.split(" ") : []), host, "umask 077 && cat > /etc/border-empires/secrets.env"],
  { input: `${lines.join("\n")}\n`, encoding: "utf8" }
);
if (put.status !== 0) {
  console.error(put.stderr || "ssh write failed");
  process.exit(1);
}
console.log(`copied ${lines.length}/${names.length} secrets to ${host}:/etc/border-empires/secrets.env (values not printed)`);
