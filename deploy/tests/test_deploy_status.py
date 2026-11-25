"""deploy/bin/deploy's restart countdown file (/__deploy_status.json).

Runs the real script against stub `docker` and `curl` commands so the order
(status file written before `compose up`, removed after /health) is tested,
not a copy of the logic.
"""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "bin/deploy"
SHA = "c" * 40

FAKE_DOCKER = """#!/usr/bin/env bash
# compose up: capture what a client would read during the downtime.
if [ "$1" = compose ] && [ "$2" = up ]; then
  if [ -f "$STATUS_FILE" ]; then cp "$STATUS_FILE" "$CAPTURE_FILE"; else echo missing > "$CAPTURE_FILE"; fi
  [ "${FAIL_COMPOSE:-0}" = 1 ] && exit 1
  exit 0
fi
[ "$1" = compose ] && [ "$2" = ps ] && { echo cid; exit 0; }
[ "$1" = inspect ] && { echo 2020-01-01T00:00:00Z; exit 0; }
exit 0
"""

FAKE_CURL = """#!/usr/bin/env bash
for last; do :; done
case "$last" in
  */health)
    [ "${HEALTHY:-1}" = 1 ] && { echo '{"ok":true}'; exit 0; }
    exit 22 ;;
esac
out=""
while [ $# -gt 0 ]; do [ "$1" = -o ] && { out="$2"; shift; }; shift; done
[ -n "$out" ] && : > "$out"
exit 0
"""


class DeployStatusTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        root = Path(self.directory.name)
        self.app = root / "app"
        self.state = root / "state"
        self.client = self.state / "client"
        bin_dir = root / "bin"
        for path in (self.app, bin_dir, self.client / "releases/one"):
            path.mkdir(parents=True)
        (self.client / "current").symlink_to("releases/one")
        for name, body in (("docker", FAKE_DOCKER), ("curl", FAKE_CURL)):
            (bin_dir / name).write_text(body)
            (bin_dir / name).chmod(0o755)
        host_conf = root / "host.conf"
        host_conf.write_text("BE_ENV=staging\nBE_HOSTNAME=localhost\nGITHUB_REPO=example/game\nIMAGE_REPO=example/image\n")
        self.status = self.client / "current/__deploy_status.json"
        self.capture = root / "captured.json"
        self.history = self.state / "restart-durations"
        self.env = {
            **os.environ,
            "PATH": f"{bin_dir}:{os.environ['PATH']}",
            "HOST_CONF": str(host_conf),
            "APP_DIR": str(self.app),
            "STATE_DIR": str(self.state),
            "STATUS_FILE": str(self.status),
            "CAPTURE_FILE": str(self.capture),
            "HEALTH_TIMEOUT_SECONDS": "1",
            "SETTLE_MIN_UPTIME_SECONDS": "0",
            "SETTLE_STREAK": "1",
        }

    def deploy(self, **env):
        return subprocess.run(["bash", str(SCRIPT), SHA], env={**self.env, **env}, capture_output=True, text=True)

    def captured(self):
        return json.loads(self.capture.read_text())

    def test_status_is_up_during_restart_and_gone_after_health(self):
        result = self.deploy()
        self.assertEqual(result.returncode, 0, result.stderr)
        status = self.captured()
        self.assertEqual(status["state"], "deploying")
        self.assertEqual(status["expectedSeconds"], 120)  # no history yet
        self.assertIsInstance(status["startedAt"], int)
        self.assertGreater(status["startedAt"], 1_600_000_000_000)  # unix ms
        self.assertFalse(self.status.exists())
        recorded = self.history.read_text().split()
        self.assertEqual(len(recorded), 1)
        self.assertLessEqual(int(recorded[0]), 5)  # stubbed restart is near-instant
        self.assertFalse([p for p in (self.client / "releases/one").iterdir() if p.name.startswith(".deploy-status")])

    def test_estimate_is_median_of_last_five_restarts(self):
        self.history.parent.mkdir(parents=True, exist_ok=True)
        self.history.write_text("999\n300\n200\n50\n400\n90\n")
        self.assertEqual(self.deploy().returncode, 0)
        self.assertEqual(self.captured()["expectedSeconds"], 200)
        recorded = self.history.read_text().split()
        self.assertEqual(recorded[:6], ["999", "300", "200", "50", "400", "90"])
        self.assertEqual(len(recorded), 7)

    def test_estimate_is_clamped(self):
        self.history.parent.mkdir(parents=True, exist_ok=True)
        self.history.write_text("5\n")
        self.deploy()
        self.assertEqual(self.captured()["expectedSeconds"], 60)
        self.history.write_text("5000\n7000\n")
        self.deploy()
        self.assertEqual(self.captured()["expectedSeconds"], 600)

    def test_failed_deploy_removes_status_and_records_nothing(self):
        result = self.deploy(HEALTHY="0")
        self.assertEqual(result.returncode, 1)
        self.assertEqual(self.captured()["state"], "deploying")
        self.assertFalse(self.status.exists())
        self.assertFalse(self.history.exists())

    def test_status_file_problems_never_fail_a_deploy(self):
        (self.client / "current").unlink()  # no live client release at all
        result = self.deploy()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.capture.read_text().strip(), "missing")
        self.history.unlink()
        self.history.mkdir()  # unwritable history
        self.assertEqual(self.deploy().returncode, 0)


if __name__ == "__main__":
    unittest.main()
