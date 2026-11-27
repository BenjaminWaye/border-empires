// The SSH step of deploy/bin/bootstrap-server.sh, run against stub `systemctl`
// and `sshd` that behave like Ubuntu 24.04 before anyone has connected:
// ssh.service is inactive, so `systemctl reload ssh` fails. A hosted sector
// server is set up by cloud-init with no SSH connection ever made. (This was
// first blamed for the failed 2026-11-25 test sector. The only log read, from a
// later test sector, showed the deploy-user step failing first; see
// bootstrap-server-user.test.mjs.)
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const script = readFileSync(join(root, "deploy/bin/bootstrap-server.sh"), "utf8");
const CONFIG = "/etc/ssh/sshd_config.d/99-border-empires.conf";

/** The script's SSH section, writing its config to a temporary file instead of /etc. */
const sshStep = (configPath) => {
  const start = script.indexOf("# --- ssh hardening");
  const end = script.indexOf("# --- firewall");
  assert.ok(start >= 0 && end > start, "bootstrap-server.sh lost its ssh or firewall section");
  const section = script.slice(start, end);
  assert.ok(section.includes(CONFIG), "the ssh section no longer writes the expected config file");
  const redirected = section.replaceAll(CONFIG, configPath);
  // Never let the test touch the machine running it.
  assert.doesNotMatch(redirected, /\/etc\//, "the ssh section writes somewhere under /etc that the test does not redirect");
  return redirected;
};

/**
 * Runs the SSH section. `sshStaysActive` models a unit that will not stop.
 * The stub fails `reload` like an inactive unit and records every call.
 */
const runStep = (beEnv, { sshStaysActive = false } = {}) => {
  const dir = mkdtempSync(join(tmpdir(), "be-bootstrap-ssh-"));
  try {
    const log = join(dir, "calls.log");
    writeFileSync(join(dir, "systemctl"), `#!/usr/bin/env bash
echo "systemctl $*" >> "${log}"
case "$1" in
  reload) echo "Job for $2 failed: unit not active" >&2; exit 1 ;;
  is-active) ${sshStaysActive ? "exit 0" : "exit 3"} ;;
esac
exit 0
`);
    writeFileSync(join(dir, "sshd"), `#!/usr/bin/env bash\necho "sshd $*" >> "${log}"\nexit 0\n`);
    chmodSync(join(dir, "systemctl"), 0o755);
    chmodSync(join(dir, "sshd"), 0o755);
    const result = spawnSync("bash", ["-c", `set -euo pipefail\n${sshStep(join(dir, "sshd.conf"))}\necho step-done`], {
      env: { PATH: `${dir}:${process.env.PATH}`, BE_ENV: beEnv },
      encoding: "utf8"
    });
    let calls = "";
    try { calls = readFileSync(log, "utf8"); } catch { /* nothing was called */ }
    return { status: result.status, stdout: result.stdout, stderr: result.stderr, calls };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test("a hosted sector server gets past the SSH step and switches each SSH unit off", () => {
  const run = runStep("hosted");
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /step-done/);
  assert.match(run.calls, /systemctl disable --now ssh\.socket/);
  assert.match(run.calls, /systemctl disable --now ssh\.service/);
  assert.match(run.calls, /systemctl is-active --quiet ssh/);
});

test("a hosted sector server stops setting up if SSH is still running afterwards", () => {
  const run = runStep("hosted", { sshStaysActive: true });
  assert.notEqual(run.status, 0);
  assert.doesNotMatch(run.stdout, /step-done/);
  assert.match(run.stderr, /SSH is still running/);
});

test("staging and production check the SSH config and reload it, even when ssh.service is not yet active", () => {
  for (const beEnv of ["staging", "production"]) {
    const run = runStep(beEnv);
    assert.equal(run.status, 0, `${beEnv}: ${run.stderr}`);
    assert.match(run.calls, /sshd -t/);
    assert.match(run.calls, /systemctl try-reload-or-restart ssh/);
    assert.doesNotMatch(run.calls, /disable/);
  }
});
