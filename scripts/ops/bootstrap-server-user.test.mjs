// The deploy-user step of deploy/bin/bootstrap-server.sh, run against stub
// commands that behave like a Hetzner server created without an SSH key: root's
// password is expired, so PAM account checks for root (adduser runs chfn) fail. The third test sector (2026-11-27) stopped right here; its
// /var/log/cloud-init-output.log ended with "fatal: '/bin/chfn -f  deploy'
// returned error code 1".
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const script = readFileSync(join(root, "deploy/bin/bootstrap-server.sh"), "utf8");

/** The line that creates the deploy user. */
const userLine = () => {
  const lines = script.split("\n").filter((line) => line.startsWith("id deploy "));
  assert.equal(lines.length, 1, "bootstrap-server.sh should create the deploy user on exactly one line");
  return lines[0];
};

const stub = (dir, name, body) => {
  const path = join(dir, name);
  writeFileSync(path, `#!/usr/bin/env bash\necho "${name} $*" >> "${join(dir, "calls.log")}"\n${body}\n`);
  chmodSync(path, 0o755);
};

test("creates the deploy user without going through PAM while root's password is expired", () => {
  const dir = mkdtempSync(join(tmpdir(), "be-bootstrap-user-"));
  try {
    stub(dir, "id", "exit 1");
    // Like adduser on Ubuntu 24.04: it runs chfn, which PAM refuses.
    stub(dir, "adduser", 'echo "fatal: /bin/chfn -f  deploy returned error code 1" >&2; exit 1');
    stub(dir, "chfn", "exit 1");
    stub(dir, "useradd", "exit 0");
    const run = spawnSync("bash", ["-c", `set -euo pipefail\n${userLine()}`], {
      env: { PATH: `${dir}:/usr/bin:/bin` },
      encoding: "utf8"
    });
    assert.equal(run.status, 0, run.stderr);
    const calls = readFileSync(join(dir, "calls.log"), "utf8");
    const useradd = calls.split("\n").find((line) => line.startsWith("useradd "));
    assert.ok(useradd, "useradd was not called");
    // The same account adduser made: a home with /etc/skel, bash for the admin key, its own group.
    for (const flag of ["--create-home", "--shell /bin/bash", "--user-group"]) assert.ok(useradd.includes(flag), `useradd lacks ${flag}`);
    assert.match(useradd, / deploy$/);
    assert.doesNotMatch(calls, /^(adduser|chfn) /m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("leaves an existing deploy user alone", () => {
  const dir = mkdtempSync(join(tmpdir(), "be-bootstrap-user-"));
  try {
    stub(dir, "id", "exit 0");
    stub(dir, "useradd", "exit 1");
    stub(dir, "adduser", "exit 1");
    const run = spawnSync("bash", ["-c", `set -euo pipefail\n${userLine()}`], {
      env: { PATH: `${dir}:/usr/bin:/bin` },
      encoding: "utf8"
    });
    assert.equal(run.status, 0, run.stderr);
    assert.doesNotMatch(readFileSync(join(dir, "calls.log"), "utf8"), /^(useradd|adduser) /m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
