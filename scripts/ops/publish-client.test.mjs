import test from "node:test";
import { execFileSync, spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("client publishing validates complete releases, rejects unsafe uploads, supports rollback and bounds storage", () => {
  execFileSync("python3", ["-m", "unittest", "discover", "-s", "deploy/tests", "-p", "test_publish_client.py"], {
    cwd: new URL("../../", import.meta.url), stdio: "pipe",
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" }
  });
});

test("ordinary and forced SSH keys use the same client command allowlist; logs keys cannot publish", () => {
  const directory = mkdtempSync(join(tmpdir(), "be-client-command-"));
  try {
    const hostConf = join(directory, "host.conf");
    writeFileSync(hostConf, "BE_ENV=staging\nBE_HOSTNAME=localhost\nGITHUB_REPO=example/game\n");
    writeFileSync(join(directory, "publish-client"), "import sys\nprint(sys.argv[1])\n");
    const env = { ...process.env, HOST_CONF: hostConf, APP_DIR: directory };
    const script = new URL("../../deploy/bin/deploy", import.meta.url).pathname;
    const ordinary = spawnSync("bash", [script, "client-rollback"], { env, encoding: "utf8" });
    assert.equal(ordinary.status, 0, ordinary.stderr);
    assert.equal(ordinary.stdout.trim(), "rollback");
    const forcedEnv = { ...env, SSH_ORIGINAL_COMMAND: "/opt/border-empires/bin/deploy client-rollback" };
    const forced = spawnSync("bash", [script], { env: forcedEnv, encoding: "utf8" });
    assert.equal(forced.status, 0, forced.stderr);
    const logs = spawnSync("bash", [script, "--logs-only"], { env: forcedEnv, encoding: "utf8" });
    assert.equal(logs.status, 2);
    assert.match(logs.stderr, /only run: logs/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
