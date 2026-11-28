"""deploy/bin/restore-backup's failure handling.

Runs the real script against stub `docker`, `zstd` and `curl` commands. The
regression: the failure handler was an ERR trap, which bash does not run for a
command failing inside a function (the swap steps all run in `run_app`), so a
failed swap left production stopped with no recovery instructions; and the
printed rollback did not stop the app or drop the restored database's -wal.
"""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "bin/restore-backup"

FAKE_DOCKER = """#!/usr/bin/env bash
cat > /dev/null
echo "docker $*" >> "$CALLS"
if [ -n "${FAIL_ON:-}" ] && [[ "$*" == *"$FAIL_ON"* ]]; then exit 1; fi
exit 0
"""

FAKE_ZSTD = """#!/usr/bin/env bash
exit "${ZSTD_FAIL:-0}"
"""

FAKE_CURL = """#!/usr/bin/env bash
[ "${HEALTHY:-1}" = 1 ] && { echo '{"ok":true}'; exit 0; }
exit 22
"""


class RestoreBackupTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        root = Path(self.directory.name)
        self.app = root / "app"
        self.state = root / "state"
        bin_dir = root / "bin"
        for path in (self.app, self.state, bin_dir):
            path.mkdir()
        for name, body in (("docker", FAKE_DOCKER), ("zstd", FAKE_ZSTD), ("curl", FAKE_CURL)):
            (bin_dir / name).write_text(body)
            (bin_dir / name).chmod(0o755)
        (self.app / "restore-prepare.mjs").write_text("// stub\n")
        host_conf = root / "host.conf"
        host_conf.write_text("BE_ENV=staging\nBE_HOSTNAME=localhost\n")
        self.backup = root / "be-staging-20261127T000000Z.db.zst"
        self.backup.write_bytes(b"not really zstd")
        self.calls = root / "calls.log"
        self.env = {
            **os.environ,
            "PATH": f"{bin_dir}:{os.environ['PATH']}",
            "HOST_CONF": str(host_conf),
            "APP_DIR": str(self.app),
            "STATE_DIR": str(self.state),
            "BACKUP_LOCK": str(root / "backup.lock"),
            "CALLS": str(self.calls),
            "HEALTH_TRIES": "2",
            "HEALTH_SLEEP": "0",
        }

    def run_restore(self, *args, **env):
        return subprocess.run(
            ["bash", str(SCRIPT), str(self.backup), *args],
            env={**self.env, **env},
            capture_output=True,
            text=True,
            timeout=60,
        )

    def calls_log(self):
        return self.calls.read_text() if self.calls.exists() else ""

    def assert_download_removed(self):
        self.assertEqual(list((self.state / "restore").iterdir()), [])

    def test_failed_swap_prints_safe_rollback(self):
        result = self.run_restore("--apply", FAIL_ON="mv /data/")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("FAILED after the app was stopped", result.stderr)
        self.assertIn("docker compose stop app && ", result.stderr)
        self.assertIn("rm -f /data/border-empires.db /data/border-empires.db-wal /data/border-empires.db-shm", result.stderr)
        self.assertNotIn("compose up", self.calls_log())
        self.assert_download_removed()

    def test_failed_ledger_apply_prints_rollback(self):
        result = self.run_restore("--apply", FAIL_ON="--apply --offline")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("FAILED after the app was stopped", result.stderr)

    def test_unhealthy_app_prints_rollback(self):
        result = self.run_restore("--apply", HEALTHY="0")
        self.assertEqual(result.returncode, 1)
        self.assertIn("did not report healthy", result.stderr)
        self.assertIn("FAILED after the app was stopped", result.stderr)

    def test_success_order_and_no_failure_message(self):
        result = self.run_restore("--apply")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn("FAILED", result.stderr)
        calls = self.calls_log()
        order = [calls.index(marker) for marker in ("compose stop app", "mv /data/", "--apply --offline", "compose up -d app")]
        self.assertEqual(order, sorted(order))
        self.assert_download_removed()

    def test_check_failure_never_touches_the_app(self):
        result = self.run_restore("--apply", ZSTD_FAIL="1")
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("FAILED after the app was stopped", result.stderr)
        self.assertNotIn("compose stop", self.calls_log())
        self.assert_download_removed()

    def test_refuses_while_a_backup_holds_the_lock(self):
        lock = self.env["BACKUP_LOCK"]
        holder = subprocess.Popen(["flock", lock, "sleep", "5"])
        self.addCleanup(holder.kill)
        subprocess.run(["sleep", "0.3"])
        result = self.run_restore("--apply")
        self.assertEqual(result.returncode, 1)
        self.assertIn("a backup or another restore is running", result.stderr)
        self.assertEqual(self.calls_log(), "")


if __name__ == "__main__":
    unittest.main()
