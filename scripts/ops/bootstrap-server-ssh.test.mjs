// The SSH step of deploy/bin/bootstrap-server.sh, run against a stub systemctl
// that behaves like Ubuntu 24.04 before anyone has connected: ssh.service is
// inactive, so `systemctl reload ssh` fails. A hosted sector server is set up
// by cloud-init with no SSH connection ever made; the first test sector
// (2026-11-25) stopped right here, before its firewall, Docker deploy and Caddy.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const script = readFileSync(join(root, "deploy/bin/bootstrap-server.sh"), "utf8");

/** The script's SSH section, writing its config to a temporary file instead of /etc. */
const sshStep = (configPath) => {
  const start = script.indexOf("# --- ssh hardening");
  const end = script.indexOf("# --- firewall");
  assert.ok(start >= 0 && end > start, "bootstrap-server.sh lost its ssh or firewall section");
  return script.slice(start, end).replaceAll("/etc/ssh/sshd_config.d/99-border-empires.conf", configPath);
};

const runStep = (beEnv) => {
  const dir = mkdtempSync(join(tmpdir(), "be-bootstrap-ssh-"));
  const log = join(dir, "systemctl.log");
  // ssh.service exists but is inactive: reload fails, everything else succeeds.
  writeFileSync(join(dir, "systemctl"), `#!/usr/bin/env bash
echo "$*" >> "${log}"
if [ "$1" = reload ]; then echo "Job for $2.service failed: unit not active" >&2; exit 1; fi
exit 0
`);
  chmodSync(join(dir, "systemctl"), 0o755);
  const result = spawnSync("bash", ["-c", `set -euo pipefail\n${sshStep(join(dir, "sshd.conf"))}\necho step-done`], {
    env: { PATH: `${dir}:${process.env.PATH}`, BE_ENV: beEnv },
    encoding: "utf8"
  });
  let calls = "";
  try { calls = readFileSync(log, "utf8"); } catch { /* systemctl never called */ }
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, calls };
};

test("a hosted sector server gets past the SSH step and switches SSH off", () => {
  const run = runStep("hosted");
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /step-done/);
  assert.match(run.calls, /disable --now ssh\.socket ssh\.service/);
});

test("staging and production get past the SSH step when ssh.service is not yet active", () => {
  for (const beEnv of ["staging", "production"]) {
    const run = runStep(beEnv);
    assert.equal(run.status, 0, `${beEnv}: ${run.stderr}`);
    assert.doesNotMatch(run.calls, /disable/);
  }
});
